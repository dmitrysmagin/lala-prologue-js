import { Screen, VIDEO, LAYER_1, LAYER_2 } from "./screen";
import { Keyboard } from "./keyboard";
import { showTitle } from "./states/title";
import { MusicPlayer } from "./audio/music-player";
import { createDefaultPrefs } from "./engine/prefs";
import { createCurScreenBuff } from "./engine/types";
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
const keyboard = new Keyboard(window);
const music = new MusicPlayer();

const hud = document.createElement("div");
hud.style.cssText = "position:fixed;bottom:8px;left:50%;transform:translateX(-50%);color:#0f0;background:rgba(0,0,0,0.6);padding:6px 10px;font:11px monospace;white-space:pre;text-align:center;pointer-events:none";
hud.textContent = "Init…";
document.body.appendChild(hud);

async function main() {
  canvas.tabIndex = 0;
  canvas.focus();
  canvas.addEventListener("click", () => canvas.focus());

  await music.init().catch(() => {});

  // ---- Phase 6 — Title screen (blocks until Enter) ----
  hud.textContent = "Title — press Enter";
  console.log("Phase 6: showTitle");
  const res = await showTitle(screen, keyboard, music, { titlePath: "/GFX/TITLE.PCX", musicPath: "/MUSIC/G66A.OGG", fadeFrames: 12 });
  console.log(`Title exited: ${res.reason}`);
  await music.fadeOut(300).catch(() => {});
  hud.textContent = "Loading game…";
  // Brief black fade already done in title; ensure screen is black
  await screen.fadeTo(0, 0, 0, 6).catch(() => {});

  // ---- Phase 5 wiring — load engine data (reused for title→game transition) ----
  const prefs = createDefaultPrefs();
  // Phase 6->7 expects G66A for title, DESORUIN for game; swap bgM now
  prefs.bgM = "DESORUIN.OGG";

  const [tileProperties, spriteProps, spriteMapping, tilesetSheet, spritesetSheet, map, _enems, hotSpots] =
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

  if (tilesetSheet.palette) screen.setPal(tilesetSheet.palette);
  else if (prefs.pal) screen.setPal(prefs.pal);

  const tileset = { width: tilesetSheet.width, height: tilesetSheet.height, data: tilesetSheet.data };
  const spriteset = { width: spritesetSheet.width, height: spritesetSheet.height, data: spritesetSheet.data };

  // Prepare initial screen (iniPant 24)
  const curScreenBuff = createCurScreenBuff();
  let nPant = prefs.iniPant;
  let frame = 0;
  function prepare(n: number) {
    engineScreenPrepare(n, tileProperties as any, map as any, curScreenBuff as any, prefs as any, hotSpots as any);
  }
  prepare(nPant);
  await screen.fadeIn(screen.getPal().length ? screen.getPal() : tilesetSheet.palette!, 12);

  // Try to start game music (DESORUIN) — if OGG missing, mute gracefully
  try {
    const r = await fetch("/MUSIC/DESORUIN.OGG", { method: "HEAD" });
    if (r.ok) await music.loadSong("/MUSIC/DESORUIN.OGG");
    else console.warn("Game music OGG not found — muted (run adplay→ffmpeg pipeline)");
  } catch { /* muted */ }

  // ---- Minimal game-start placeholder (Phase 7 will replace with engineDoGame loop) ----
  // Render map + player sprite stub + stats, allow ←/→ to change screen for verification
  keyboard.clear();
  canvas.focus();
  hud.textContent = `Game started — pant ${nPant} (←/→ to switch, Enter returns to title)`;

  let rafId = 0;
  const loop = () => {
    frame++;

    // Input — allow return to title on Enter (demo of startup flow loop)
    if (keyboard.isDown(0x1c)) { // Enter
      keyboard.clear();
      cancelAnimationFrame(rafId);
      music.stop();
      // Restart title loop recursively
      main().catch(console.error);
      return;
    }
    // Screen switching demo (not yet full collision, just map view)
    if (frame % 12 === 0) {
      if (keyboard.isDown(0x4b) && nPant > 0) { nPant--; prepare(nPant); }
      else if (keyboard.isDown(0x4d) && nPant < prefs.mapW * prefs.mapH - 1) { nPant++; prepare(nPant); }
    }

    screen.clearLayer(LAYER_1);
    screen.clearLayer(LAYER_2);
    screen.clearLayer(VIDEO);

    // DQBcopyLayer backdrop stub (clear) → draw layer1
    engineScreenDrawLayer1(screen as any, tileset as any, prefs as any, curScreenBuff as any, LAYER_1);
    // Player stub at iniTX/TY
    const px = prefs.iniTX * 16;
    const py = prefs.iniTY * 16;
    const sid = spriteMapping[0] ?? 0;
    screen.blitSprite(LAYER_1, spriteset as any, sid, prefs.screenPos.x + px, prefs.screenPos.y + py, spriteProps as any);
    // Layer2 animated on top
    engineScreenDrawLayer2(screen as any, tileset as any, prefs as any, curScreenBuff as any, frame & 3, LAYER_1);
    screen.copyLayer(LAYER_1, VIDEO);

    // HUD stats placeholder (original enginePrintStats draws 3 icons + numbers)
    // Keep DOM hud for now; don't spam filterBox here.

    screen.present();
    hud.textContent =
      `Game — pant ${nPant} (${nPant % prefs.mapW},${Math.floor(nPant / prefs.mapW)}) frame ${frame & 3} | tiles ${prefs.numTiles} sprites ${prefs.numSprites} ` +
      `| hotSpot ${prefs.hotSpotX},${prefs.hotSpotY} | Enter→Title  ←/→ switch`;

    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
  console.log(`Phase 6 complete — title → game transition live. Title returned "${res.reason}", game pant ${nPant} ready.`);
}

main().catch((e) => {
  console.error(e);
  hud.textContent = `Error: ${(e as Error).message}`;
  screen.clearLayer(VIDEO);
  screen.fillRect(VIDEO, 0, 0, 320, 200, 4);
  screen.present();
});
