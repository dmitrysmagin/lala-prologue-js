import { Screen, VIDEO, LAYER_1, LAYER_2 } from "./screen";
import { PCXLoader } from "./assets/PCXLoader";

const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const screen = new Screen(canvas);

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

async function main() {
  // Fallback palette if PCX palette missing
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
    // PCX palette is 768 bytes RGB 0-255; setPal handles scaling
    if (ts.palette) screen.setPal(ts.palette);
    else screen.setPal(fallbackPal);
    // SPRSET may have its own palette overlay — tileset palette is canonical;
    // if spriteset palette differs we keep tileset one (original engine uses one global pal)

    if (sprPropTxt) spriteProps = parseSprProp(sprPropTxt);

    console.log(`TILESET ${ts.width}x${ts.height} tiles=${(ts.width / 16) * (ts.height / 16)} pal=${!!ts.palette}`);
    console.log(`SPRSET  ${ss.width}x${ss.height} sprites=${(ss.width / 24) * (ss.height / 24)} props=${spriteProps.length}`);
  } catch (e) {
    console.warn("PCX load failed, using synthetic sheets", e);
    // Synthetic sheets for CI / missing public
    screen.setPal(fallbackPal);
    const tw = 128, th = 64;
    const sd = new Uint8Array(tw * th);
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) sd[y * tw + x] = ((x >> 3) ^ (y >> 3)) & 0xff;
    // Paint index 0 border to showcase transparency
    for (let x = 0; x < tw; x++) { sd[x] = 0; sd[(th - 1) * tw + x] = 0; }
    for (let y = 0; y < th; y++) { sd[y * tw] = 0; sd[y * tw + tw - 1] = 0; }
    tileset = { width: tw, height: th, data: sd };
    const sw = 96, sh = 48;
    const spd = new Uint8Array(sw * sh);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) spd[y * sw + x] = ((x * 7 + y * 3) & 0xff) || 16;
    // Checker hole for transparency demo
    for (let y = 4; y < 20; y++) for (let x = 4; x < 20; x++) if (((x + y) & 1) === 0) spd[y * sw + x] = 0;
    spriteset = { width: sw, height: sh, data: spd };
    spriteProps = [{ offX: 4, offY: 8 }, { offX: 2, offY: 6 }];
  }

  // --- Phase 2 + 3 demo ---
  screen.clearLayer(VIDEO);
  screen.clearLayer(LAYER_1);
  screen.clearLayer(LAYER_2);

  // 1) blitTile: draw a row of tiles across LAYER_1 (16×16)
  const tileCount = Math.floor(tileset.width / 16) * Math.floor(tileset.height / 16);
  const tilesToShow = Math.min(tileCount, 12);
  for (let i = 0; i < tilesToShow; i++) {
    const x = 8 + i * 18;
    const y = 8;
    screen.blitTile(LAYER_1, tileset, i, x, y);
  }
  // Clip test: partially off-screen
  screen.blitTile(LAYER_1, tileset, 0, -4, 40);
  screen.blitTile(LAYER_1, tileset, 1, 310, 40);

  // 2) blitSprite: 24×24 with offsets, transparency
  const spriteCount = Math.floor(spriteset.width / 24) * Math.floor(spriteset.height / 24);
  const spritesToShow = Math.min(spriteCount, 8);
  for (let i = 0; i < spritesToShow; i++) {
    const x = 8 + i * 26;
    const y = 40;
    screen.blitSprite(LAYER_1, spriteset, i, x, y, spriteProps);
  }
  // Sprite without props (no offset) for comparison
  if (spriteCount > 0) screen.blitSprite(LAYER_1, spriteset, 0, 8, 80);

  // 3) blitFromLayer: copy a 64×32 chunk from LAYER_1 → LAYER_2 at new position
  //    Mirrors DQBput / DQBget — copies both indices and RGBA.
  screen.blitFromLayer(LAYER_1, LAYER_2, 8, 8, 64, 32, 200, 120);

  // 4) Transparency check: over-blit a tile with zeros — should not erase underlying pixels
  //    (tile 0 often has 0 border in synthetic; in real assets index 0 is transparent)
  screen.blitTile(LAYER_1, tileset, 0, 100, 100);

  // Composite to VIDEO: VIDEO already cleared, copy LAYER_1 then transparent-merge LAYER_2
  screen.copyLayer(LAYER_1, VIDEO);
  {
    const sIdx = screen.getLayerIndices(LAYER_2);
    const sU32 = screen.getLayerU32(LAYER_2);
    const dIdx = screen.getLayerIndices(VIDEO);
    const dU32 = screen.getLayerU32(VIDEO);
    for (let i = 0; i < 320 * 200; i++) if (sIdx[i] !== 0) { dIdx[i] = sIdx[i]; dU32[i] = sU32[i]; }
  }

  // 5) Exhaustive blitFromLayer self-copy test (same layer)
  screen.blitFromLayer(VIDEO, VIDEO, 0, 0, 32, 32, 280, 160);

  screen.present();
  screen.start();

  console.log(`Phase 3 ready — blitTile 16×16, blitSprite 24×24 (offX/offY), blitFromLayer — tiles:${tilesToShow} sprites:${spritesToShow}`);
}

main().catch((e) => {
  console.error(e);
  // Ensure something visible even on failure
  screen.clearLayer(VIDEO);
  screen.setPal(new Uint8Array(768).fill(0).map((_, i) => (i % 3 === 0 ? 255 : 0)));
  screen.fillRect(VIDEO, 0, 0, 320, 200, 1);
  screen.present();
});
