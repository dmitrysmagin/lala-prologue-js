import { Screen, VIDEO, LAYER_1, LAYER_2 } from "./screen";
import { PCXLoader } from "./assets/PCXLoader";
import { Keyboard, SC_LEFT, SC_RIGHT, SC_UP, SC_ENTER, SC_CTRL, SC_W, SC_E, SC_R } from "./keyboard";

const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const screen = new Screen(canvas);
const kb = new Keyboard(window);

async function loadPcx(path: string) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`fetch ${path}: ${r.status}`);
  const data = new Uint8Array(await r.arrayBuffer());
  return new PCXLoader().load(data);
}

function parseSprProp(text: string): { offX: number; offY: number }[] {
  return text
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      const [xs, ys] = line.split(",").map((s) => parseInt(s.trim(), 10));
      return { offX: xs | 0, offY: ys | 0 };
    });
}

// Minimal on-screen debug HUD via DOM (since font not yet ported)
const hud = document.createElement("div");
hud.style.cssText = "position:fixed;top:8px;left:50%;transform:translateX(-50%);color:#0f0;background:rgba(0,0,0,0.7);padding:4px 8px;font:12px monospace;white-space:pre;pointer-events:none";
hud.textContent = "Loading…";
document.body.appendChild(hud);

async function main() {
  const fallbackPal = new Uint8Array(768);
  for (let i = 0; i < 256; i++) {
    fallbackPal[i * 3] = (i * 2) & 0xff;
    fallbackPal[i * 3 + 1] = (i * 3) & 0xff;
    fallbackPal[i * 3 + 2] = (i * 5) & 0xff;
  }

  let tileset: { width: number; height: number; data: Uint8Array };
  let spriteset: { width: number; height: number; data: Uint8Array };
  let spriteProps: { offX: number; offY: number }[] = [];

  try {
    const [ts, ss, sprPropTxt] = await Promise.all([
      loadPcx("/GFX/TILESET.PCX"),
      loadPcx("/GFX/SPRSET.PCX"),
      fetch("/GFX/SPRPROP.TXT").then((r) => (r.ok ? r.text() : "")),
    ]);
    tileset = ts;
    spriteset = ss;
    if (ts.palette) screen.setPal(ts.palette);
    else screen.setPal(fallbackPal);
    if (sprPropTxt) spriteProps = parseSprProp(sprPropTxt);
    console.log(`TILESET ${ts.width}x${ts.height} tiles=${(ts.width / 16) * (ts.height / 16)} | SPRSET ${ss.width}x${ss.height} props=${spriteProps.length}`);
  } catch (e) {
    console.warn("PCX load failed, using synthetic sheets", e);
    screen.setPal(fallbackPal);
    const tw = 128, th = 64;
    const sd = new Uint8Array(tw * th);
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) sd[y * tw + x] = ((x >> 3) ^ (y >> 3)) & 0xff;
    for (let x = 0; x < tw; x++) { sd[x] = 0; sd[(th - 1) * tw + x] = 0; }
    for (let y = 0; y < th; y++) { sd[y * tw] = 0; sd[y * tw + tw - 1] = 0; }
    tileset = { width: tw, height: th, data: sd };
    const sw = 96, sh = 48;
    const spd = new Uint8Array(sw * sh);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) spd[y * sw + x] = ((x * 7 + y * 3) & 0xff) || 16;
    for (let y = 4; y < 20; y++) for (let x = 4; x < 20; x++) if (((x + y) & 1) === 0) spd[y * sw + x] = 0;
    spriteset = { width: sw, height: sh, data: spd };
    spriteProps = [{ offX: 4, offY: 8 }, { offX: 2, offY: 6 }];
  }

  // --- Static background on LAYER_1 ---
  screen.clearLayer(VIDEO);
  screen.clearLayer(LAYER_1);
  screen.clearLayer(LAYER_2);

  const tileCount = Math.floor(tileset.width / 16) * Math.floor(tileset.height / 16);
  const tilesToShow = Math.min(tileCount, 12);
  for (let i = 0; i < tilesToShow; i++) screen.blitTile(LAYER_1, tileset, i, 8 + i * 18, 8);
  screen.blitTile(LAYER_1, tileset, 0, -4, 40);
  screen.blitTile(LAYER_1, tileset, 1, 310, 40);
  const spriteCount = Math.floor(spriteset.width / 24) * Math.floor(spriteset.height / 24);
  for (let i = 0; i < Math.min(spriteCount, 6); i++) screen.blitSprite(LAYER_1, spriteset, i, 8 + i * 26, 40, spriteProps);
  screen.blitFromLayer(LAYER_1, LAYER_2, 8, 8, 64, 32, 200, 120);

  // --- Interactive state (Phase 4) ---
  let curX = 120, curY = 90;
  let curSprite = 0;
  let lastEnterLog = 0;
  let cheatArmed = false;

  // Demonstrate readKey/inkey/waitKey semantics in console
  kb.clear();
  console.log("Keyboard ready — scancodes: Ctrl=0x1D Enter=0x1C Left=0x4B Up=0x48 Right=0x4D W=0x11 E=0x12 R=0x13. Hold W+E+R for cheat.");

  // Non-blocking waitKey demo: resolve after 3s if Enter not pressed
  kb.waitKey(SC_ENTER).then(() => console.log("waitKey(SC_ENTER) resolved — Enter was pressed"));

  function frame() {
    const left = kb.isDown(SC_LEFT);
    const right = kb.isDown(SC_RIGHT);
    const up = kb.isDown(SC_UP);
    const ctrl = kb.isDown(SC_CTRL);
    const enter = kb.isDown(SC_ENTER);

    // DQBinkey$ / readKey demo: drain queues each frame and log
    const sc = kb.readKey();
    if (sc) console.log(`readKey() -> 0x${sc.toString(16)} (${Keyboard.scancodeToCodes(sc).join("/")})`);
    const ch = kb.inkey();
    if (ch) console.log(`inkey() -> ${JSON.stringify(ch)}`);
    if (enter && performance.now() - lastEnterLog > 300) {
      lastEnterLog = performance.now();
      console.log("Enter isDown — would start game in Phase 6");
      kb.clear(); // demo clear() flush
    }

    // Cheat W+E+R
    const cheat = kb.isDown(SC_W) && kb.isDown(SC_E) && kb.isDown(SC_R);
    if (cheat && !cheatArmed) { cheatArmed = true; console.log("Cheat W+E+R detected!"); }
    if (!cheat) cheatArmed = false;

    // Move cursor (2 px/frame, Ctrl = faster jump)
    const speed = ctrl ? 4 : 2;
    if (left) curX -= speed;
    if (right) curX += speed;
    if (up) curY -= speed;
    // Gravity sim when no key? keep within bounds
    curX = Math.max(-12, Math.min(320 - 12, curX));
    curY = Math.max(-12, Math.min(200 - 12, curY));
    if (left) curSprite = (curSprite + 1) % Math.max(1, spriteCount);

    // Rebuild VIDEO each frame: LAYER_1 bg → VIDEO, then cursor sprite on top
    screen.copyLayer(LAYER_1, VIDEO);
    // transparent-merge LAYER_2 if needed (static demo box)
    {
      const sIdx = screen.getLayerIndices(LAYER_2);
      const sU32 = screen.getLayerU32(LAYER_2);
      const dIdx = screen.getLayerIndices(VIDEO);
      const dU32 = screen.getLayerU32(VIDEO);
      for (let i = 0; i < 320 * 200; i++) if (sIdx[i] !== 0) { dIdx[i] = sIdx[i]; dU32[i] = sU32[i]; }
    }
    // Blit controllable sprite at curX/curY (24×24, with spriteProps offset)
    screen.blitSprite(VIDEO, spriteset, curSprite % spriteCount, curX | 0, curY | 0, spriteProps);
    // Highlight with rect when cheat active
    if (cheat) screen.drawRect(VIDEO, curX - 2, curY - 2, curX + 24, curY + 24, 15);

    // HUD
    const pressed = kb.pressedSnapshot().map((s) => `0x${s.toString(16).padStart(2,"0")}`).join(" ") || "(none)";
    hud.textContent = `←/→/↑  Ctrl  Enter | W+E+R cheat | pos ${curX|0},${curY|0} spr ${curSprite} | down: ${pressed}${cheat ? "  CHEAT!" : ""}`;

    screen.present();
    requestAnimationFrame(frame);
  }

  // Capture focus so keys work without clicking
  canvas.tabIndex = 0;
  canvas.focus();
  canvas.addEventListener("click", () => canvas.focus());

  requestAnimationFrame(frame);
  console.log("Phase 4 ready — keyboard scancode input active, move sprite with ← → ↑, Ctrl, Enter, W+E+R");
}

main().catch((e) => {
  console.error(e);
  hud.textContent = `Error: ${(e as Error).message}`;
  screen.clearLayer(VIDEO);
  screen.fillRect(VIDEO, 0, 0, 320, 200, 2);
  screen.present();
});
