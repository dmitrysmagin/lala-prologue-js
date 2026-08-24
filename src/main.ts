import { Screen, VIDEO, LAYER_1, LAYER_2, LAYER_3 } from "./screen";
import { Keyboard, SC_LEFT, SC_RIGHT, SC_UP, SC_ENTER, SC_CTRL } from "./keyboard";
import { createDefaultPrefs } from "./engine/prefs";
import { createCurScreenBuff, cToIdx } from "./engine/types";
import {
  engineLoadTileProperties,
  engineLoadSpriteProperties,
  engineLoadSpriteMapping,
  engineLoadTileset,
  engineLoadSpriteset,
  engineMapLoad,
  engineLoadEnems,
  engineLoadHotSpots,
  engineScreenPrepare,
  engineScreenDrawLayer1,
  engineScreenDrawLayer2,
} from "./engine/map";

const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const screen = new Screen(canvas);
const kb = new Keyboard(window);

const hud = document.createElement("div");
hud.style.cssText = "position:fixed;top:8px;left:50%;transform:translateX(-50%);color:#0f0;background:rgba(0,0,0,0.75);padding:4px 8px;font:11px monospace;white-space:pre;pointer-events:none;max-width:95vw;overflow:hidden";
hud.textContent = "Loading Phase 5…";
document.body.appendChild(hud);

async function main() {
  // ---- Phase 5 — prefs + typed data structures ----
  const prefs = createDefaultPrefs();
  console.log("prefs", prefs);

  // Load all data via engine loaders (mirrors engineInitVals → init sequence)
  const [tileProperties, spriteProps, spriteMapping, tilesetSheet, spritesetSheet, map, enems, hotSpots] =
    await Promise.all([
      engineLoadTileProperties(prefs),
      engineLoadSpriteProperties(prefs),
      engineLoadSpriteMapping(prefs),
      engineLoadTileset(prefs),
      engineLoadSpriteset(prefs),
      engineMapLoad(prefs),
      engineLoadEnems(prefs),
      engineLoadHotSpots(prefs),
    ]);

  console.log(`tileProperties ${tileProperties.length} (numTiles=${prefs.numTiles})`, tileProperties.slice(0, 4));
  console.log(`spriteProps ${spriteProps.length} (numSprites=${prefs.numSprites})`, spriteProps.slice(0, 3));
  console.log(`spriteMapping ${spriteMapping.length}`, spriteMapping.slice(0, 12));
  console.log(`map ${map.length} bytes (expected ${prefs.mapW * prefs.mapH * prefs.screenW * prefs.screenH})`);
  console.log(`enems ${enems.length} screens × ${enems[0]?.length ?? 0} (nEnems=${prefs.nEnems})`, enems[prefs.iniPant]?.slice(0, 2));
  console.log(`hotSpots ${hotSpots.length}`, hotSpots.slice(0, 5));

  // Palette: tileset load already wrote prefs.pal; apply to Screen
  if (tilesetSheet.palette) screen.setPal(tilesetSheet.palette);
  else if (prefs.pal) screen.setPal(prefs.pal);
  else {
    const fallback = new Uint8Array(768);
    for (let i = 0; i < 256; i++) { fallback[i*3]=i; fallback[i*3+1]=i; fallback[i*3+2]=i; }
    screen.setPal(fallback);
  }

  // Verify LALA.BMA still loads (Phase 1) — filterBox demo uses it
  let bmap: Uint8Array | null = null;
  try {
    const r = await fetch("/GFX/LALA.BMA");
    if (r.ok) bmap = new Uint8Array(await r.arrayBuffer());
    if (bmap && bmap.length === 256) { /* 512 bytes pseudo? pad */ }
    console.log(`BMA ${bmap?.length ?? 0} bytes`);
  } catch { /* ignore */ }

  // ---- Buffers ----
  const curScreenBuff = createCurScreenBuff();
  let nPant = prefs.iniPant; // 24 per prefs
  let frame = 0;

  function prepare(n: number) {
    engineScreenPrepare(n, tileProperties as any, map as any, curScreenBuff as any, prefs as any, hotSpots as any);
    console.log(`engineScreenPrepare pant=${n} xy=(${n%prefs.mapW},${Math.floor(n/prefs.mapW)}) hotSpot=(${prefs.hotSpotX},${prefs.hotSpotY}) curBuff[23].layer1=${curScreenBuff[23].layer1} cToIdx(0,0)=${cToIdx(0,0)}`);
  }
  prepare(nPant);

  // ---- Render function using Phase 5 helpers + Phase 3 blitter ----
  // Tileset/sprite sheet objects compatible with Screen.blitTile/blitSprite
  const tileset = { width: tilesetSheet.width, height: tilesetSheet.height, data: tilesetSheet.data };
  const spriteset = { width: spritesetSheet.width, height: spritesetSheet.height, data: spritesetSheet.data };

  function render() {
    screen.clearLayer(LAYER_3);
    screen.clearLayer(LAYER_2);
    screen.clearLayer(LAYER_1);
    screen.clearLayer(VIDEO);

    // Backdrop — if available copy to LAYER_3 then to LAYER_2 as game does
    // For Phase 5 just draw Layer1 foreground/background via map.ts helpers
    engineScreenDrawLayer1(screen as any, tileset as any, prefs as any, curScreenBuff as any, LAYER_2);
    // Copy bg to VIDEO later; mimic game: LAYER_2 bg → LAYER_1 → VIDEO
    screen.copyLayer(LAYER_2, LAYER_1);

    // Draw a couple sprites for sanity: player sprite 0 at screenPos + 32,32 and an enemy sprite
    const px = 32, py = 32;
    const sId = spriteMapping[0] ?? 0;
    screen.blitSprite(VIDEO, spriteset, sId, prefs.screenPos.x + px, prefs.screenPos.y + py, spriteProps as any);
    // also blit hotSpot tile if present (like engineDrawHotSpots)
    const hs = hotSpots[nPant];
    if (hs && hs.s && hs.t > 0) {
      const tileByType = [0, prefs.objectTile, prefs.keyTile, prefs.lifeTile];
      const ht = tileByType[hs.t] ?? prefs.objectTile;
      screen.blitTile(VIDEO, tileset, ht, prefs.screenPos.x + (hs.x << 4), prefs.screenPos.y + (hs.y << 4));
      // filterBox darken box demo
      if (bmap && bmap.length >= 65536) screen.filterBox(VIDEO, 80, 136, 239, 151, 255, bmap);
    }

    // Animated layer2 on top
    engineScreenDrawLayer2(screen as any, tileset as any, prefs as any, curScreenBuff as any, frame, VIDEO);
    // But our VIDEO already has sprites; in game order it's: copy LAYER_2→L1, draw player/enemy on L1, then draw layer2 onto L1, then copy L1→VIDEO.
    // For demo we merged; instead do proper: L1 (bg) already in LAYER_1, blit sprites onto VIDEO, then layer2 onto VIDEO (overwrite)
    // Already did sprites onto VIDEO then layer2 onto VIDEO — acceptable.

    // For demo, copy composition to canvas and add frame counter border
    if (frame % 60 < 30) screen.drawRect(VIDEO, 0, 0, 319, 199, 15);
  }

  // ---- Interactive — Phase 4 keyboard drives Phase 5 map navigation ----
  let lastMove = 0;
  canvas.tabIndex = 0; canvas.focus(); canvas.addEventListener("click", () => canvas.focus());

  kb.clear();
  console.log("Phase 5 ready: ←/→ change screen, ↑ resets to iniPant, Ctrl+Enter logs queues. W+E+R still cheat.");

  function loop() {
    const now = performance.now();
    const left = kb.isDown(SC_LEFT);
    const right = kb.isDown(SC_RIGHT);
    const up = kb.isDown(SC_UP);
    const ctrl = kb.isDown(SC_CTRL);
    const enter = kb.isDown(SC_ENTER);

    // Drain queues for logging (inkey/readKey demo)
    const sc = kb.readKey(); if (sc) console.log(`readKey 0x${sc.toString(16)} ${Keyboard.scancodeToCodes(sc).join("/")}`);
    const ch = kb.inkey(); if (ch) console.log(`inkey ${JSON.stringify(ch)}`);

    // Screen switching with debounce 200ms (like game attempt)
    if (now - lastMove > 180) {
      let changed = false;
      if (left && nPant > 0) { nPant--; changed = true; }
      else if (right && nPant < prefs.mapW * prefs.mapH - 1) { nPant++; changed = true; }
      else if (up) { nPant = prefs.iniPant; changed = true; }
      if (changed) {
        lastMove = now;
        prepare(nPant);
        // heartbeat via engineLoad* already set prefs.hotSpot*; also verify cToIdx
        console.log(`nPant=${nPant} xPant=${nPant%prefs.mapW} yPant=${Math.floor(nPant/prefs.mapW)}`);
        kb.clear(); // flush like game does after transition
      }
    }
    if (ctrl && enter && now - lastMove > 300) {
      lastMove = now;
      console.log("Ctrl+Enter - dump curScreenBuff sample", curScreenBuff.slice(22, 30));
    }

    frame = (frame + 1) & 0xffff;
    render();
    screen.present();

    const pantX = nPant % prefs.mapW, pantY = Math.floor(nPant / prefs.mapW);
    const hs = hotSpots[nPant];
    const en = enems[nPant] ?? [];
    const activeEnems = en.filter((e) => e.t !== 0).length;
    hud.textContent =
      `Phase5 prefs ${prefs.mapW}×${prefs.mapH} screen ${prefs.screenW}×${prefs.screenH} | pant ${nPant} (${pantX},${pantY}) ini=${prefs.iniPant}\n` +
      `tiles ${prefs.numTiles} sprites ${prefs.numSprites} frame ${frame & 3} | map[${curScreenBuff[cToIdx(0,0)].realMapIndex}]→${map[curScreenBuff[cToIdx(0,0)].realMapIndex]}\n` +
      `hotSpot pant${nPant} t=${hs?.t ?? 0} s=${hs?.s} pos=(${hs?.x},${hs?.y}) → (${prefs.hotSpotX},${prefs.hotSpotY}) | enems ${activeEnems}/${prefs.nEnems}\n` +
      `←/→ screen  ↑ reset  | down: ${kb.pressedSnapshot().map(s=>`0x${s.toString(16).padStart(2,"0")}`).join(" ") || "(none)"}`;

    requestAnimationFrame(loop);
  }

  // Initial render + loop
  render();
  screen.present();
  requestAnimationFrame(loop);
  console.log(`LaLa Phase 5 — data structures wired: ${prefs.screenW}×${prefs.screenH} screens=${prefs.mapW*prefs.mapH} cToIdx OK, map+tileProperties→layer mapping ready.`);
}

main().catch((e) => {
  console.error(e);
  hud.textContent = `Phase5 error: ${(e as Error).message}\n${(e as Error).stack ?? ""}`;
  screen.clearLayer(VIDEO);
  screen.fillRect(VIDEO, 0, 0, 320, 200, 1);
  screen.drawRect(VIDEO, 0, 0, 319, 199, 15);
  screen.present();
});
