import { Screen } from "./screen";
import { Keyboard } from "./keyboard";
import { showTitle } from "./states/title";
import { showEnding } from "./states/ending";
import { MusicPlayer } from "./audio/music-player";
import { SoundEffects } from "./audio/sound-effects";
import { createDefaultPrefs, createPlayer } from "./engine/prefs";
import { createCurScreenBuff } from "./engine/types";
import { PCXLoader } from "./assets/PCXLoader";
import {
  engineLoadTileProperties,
  engineLoadSpriteProperties,
  engineLoadSpriteMapping,
  engineLoadTileset,
  engineLoadSpriteset,
  engineMapLoad,
  engineLoadEnems,
  engineLoadHotSpots,
} from "./engine/map";
import { engineDoGame } from "./engine/game-loop";
import { scrollDoGame } from "./engine/scroll-game-loop";
import { loadGameFont } from "./assets/fnt-cache";
import { config } from "./engine/config";
import { buildWorldBuff, convertEnemiesToWorld, convertHotSpotsToWorld, type WorldBuff, type Camera } from "./engine/scroll-types";

const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const screen = new Screen(canvas);
const keyboard = new Keyboard(window);
const music = new MusicPlayer();
const sfx = new SoundEffects();

const hud = document.createElement("div");
hud.style.cssText =
  "position:fixed;bottom:8px;left:50%;transform:translateX(-50%);color:#0f0;" +
  "background:rgba(0,0,0,0.6);padding:6px 10px;font:11px monospace;" +
  "white-space:pre;text-align:center;pointer-events:none;z-index:50";
hud.textContent = "Init…";
document.body.appendChild(hud);

async function loadGameData() {
  const prefs = createDefaultPrefs();
  console.log("[main] loadGameData: fetching assets");
  const [tileProperties, spriteProperties, spriteMapping, tilesetSheet, spritesetSheet, map, enems, hotSpots] =
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
  // Ensure FNT font is cached for HUD / game-over text
  await loadGameFont("/GFX/lala.fnt").catch(() => null);
  console.log("[main] loadGameData: done");
  if (tilesetSheet.palette) screen.setPal(tilesetSheet.palette);
  else if (prefs.pal) screen.setPal(prefs.pal);

  // Force HUD text colours (engineRprint uses 255=shadow, 254=foreground)
  // to bright values so digits are always legible regardless of tileset palette.
  const pal = screen.getPal();
  pal[254 * 3] = 255; pal[254 * 3 + 1] = 255; pal[254 * 3 + 2] = 255; // 254 = white
  pal[255 * 3] = 0;   pal[255 * 3 + 1] = 0;   pal[255 * 3 + 2] = 0;   // 255 = black
  screen.setPal(pal);

  return { prefs, tileProperties, spriteProperties, spriteMapping, tilesetSheet, spritesetSheet, map, enems, hotSpots };
}

async function main() {
  // ---- Banner: force user click so AudioContext can start legally ----
  const banner = document.getElementById("startBanner");
  if (banner) {
    await new Promise<void>((resolve) => {
      banner.addEventListener("click", () => {
        // Create AudioContext INSIDE the gesture handler — Chrome requires this.
        music.init().catch(() => {});
        sfx.ensureContext();
        sfx.loadAll().catch(() => {});
        banner.remove();
        resolve();
      }, { once: true });
    });
  }

  canvas.tabIndex = 0;
  canvas.focus();
  canvas.addEventListener("click", () => canvas.focus());

  // Show title IMMEDIATELY — game data loads in parallel
  console.log("[main] showing title immediately");
  hud.textContent = "Title — press Enter / click";

  const titlePromise = showTitle(screen, keyboard, music, {
    titlePath: "/GFX/TITLE.PCX",
    musicPath: "/MUSIC/G66A.ogg",
    fadeFrames: 12,
  });

  // Load game data in parallel with title being shown
  const dataPromise = loadGameData();

  // Wait for BOTH: user pressed Enter AND data is loaded
  const [titleRes, data] = await Promise.all([titlePromise, dataPromise]);
  console.log(`[main] title -> ${titleRes.reason}, data loaded`);
  config.scrollEnabled = titleRes.scrollEnabled;

  await music.fadeOut(250).catch(() => {});
  await screen.fadeTo(0, 0, 0, 8).catch(() => {});
  keyboard.clear();
  screen.clearLayer(0);
  screen.clearLayer(1);
  screen.clearLayer(2);
  screen.clearLayer(3);

  const player = createPlayer(data.prefs);
  const curScreenBuff = createCurScreenBuff();

  // Build world buffer for scroll engine (always built, used when scrollEnabled)
  let world: WorldBuff | null = null;
  let scrollCamera: Camera = { x: 0, y: 0 };
  let worldHotSpots = data.hotSpots; // default: per-screen (flip engine)
  let backdrop: { width: number; height: number; data: Uint8Array } | null = null;
  let origMap: Uint8Array | null = null; // preserve pristine map for restart
  let origEnemyData: { x: number; y: number; x1: number; y1: number; x2: number; y2: number; mx: number; my: number }[][] | null = null;
  {
    // Keep untouched copies — scrollClearKeyHole mutates map, convertEnemiesToWorld mutates positions
    origMap = new Uint8Array(data.map);
    origEnemyData = data.enems.map(screen => screen.map(e => ({
      x: e.x, y: e.y, x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, mx: e.mx, my: e.my,
    })));
    world = buildWorldBuff(data.map, data.tileProperties, data.prefs);
    convertEnemiesToWorld(data.enems, data.prefs);
    worldHotSpots = convertHotSpotsToWorld(data.hotSpots, data.prefs);
    // Position camera on starting screen
    const sx = data.prefs.iniPant % data.prefs.mapW;
    const sy = Math.floor(data.prefs.iniPant / data.prefs.mapW);
    scrollCamera.x = sx * data.prefs.screenW * 16;
    scrollCamera.y = sy * data.prefs.screenH * 16;
    // Load backdrop
    try {
      const r = await fetch(`/GFX/${data.prefs.backdropFile}`);
      if (r.ok) backdrop = new PCXLoader().load(new Uint8Array(await r.arrayBuffer()));
    } catch { /* no backdrop */ }
  }

  // Outer loop: Title → Play → Title
  while (true) {
    const prefs = data.prefs;
    const fresh = createPlayer(prefs);
    Object.assign(player, fresh);
    player.lives = prefs.initialLives;
    player.keys = 0;
    player.objects = 0;
    player.gameOver = 0;
    for (const hs of data.hotSpots) hs.s = true;
    // Restore original enemy data (convertEnemiesToWorld mutates in place)
    if (origEnemyData) {
      for (let s = 0; s < data.enems.length && s < origEnemyData.length; s++) {
        for (let i = 0; i < data.enems[s].length && i < origEnemyData[s].length; i++) {
          const o = origEnemyData[s][i];
          const e = data.enems[s][i];
          e.x = o.x; e.y = o.y; e.x1 = o.x1; e.y1 = o.y1;
          e.x2 = o.x2; e.y2 = o.y2; e.mx = o.mx; e.my = o.my;
        }
      }
    }
    if (config.scrollEnabled) {
      // Rebuild world buffer from restored map (doors, behaviours, etc.)
      world = buildWorldBuff(data.map, data.tileProperties, data.prefs);
      // Recalculate world-absolute enemy positions from restored per-screen data
      convertEnemiesToWorld(data.enems, data.prefs);
      worldHotSpots = convertHotSpotsToWorld(data.hotSpots, data.prefs);
      // Player starting position in world-absolute coords
      const sx = prefs.iniPant % prefs.mapW;
      const sy = Math.floor(prefs.iniPant / prefs.mapW);
      player.x = (sx * prefs.screenW + prefs.iniTX) * 16 * 64;
      player.y = (sy * prefs.screenH + prefs.iniTY) * 16 * 64;
      // Reset camera to starting screen
      scrollCamera.x = sx * prefs.screenW * 16;
      scrollCamera.y = sy * prefs.screenH * 16;
    }

    // Restore pristine map before starting game (both engines mutate it)
    if (origMap) data.map.set(origMap);

    await screen.fadeIn(data.tilesetSheet.palette!, 10);
    try {
      const r = await fetch("/MUSIC/DESORUIN.ogg", { method: "HEAD" });
      if (r.ok) await music.loadSong("/MUSIC/DESORUIN.ogg");
    } catch { /* muted */ }

    hud.textContent = `Game — pant ${prefs.iniPant} | ←/→/↑ / Ctrl  W+E+R cheat`;

    const tileset = { width: data.tilesetSheet.width, height: data.tilesetSheet.height, data: data.tilesetSheet.data, palette: data.tilesetSheet.palette };
    const spriteset = { width: data.spritesetSheet.width, height: data.spritesetSheet.height, data: data.spritesetSheet.data, palette: data.spritesetSheet.palette };

    // Engine selection: scroll or flip-screen
    let res: number;
    if (config.scrollEnabled && world) {
      // Flatten enemies from per-screen array to world-absolute flat array
      const flatEnemies = data.enems.flat();
      res = await scrollDoGame({
        screen, keyboard, prefs,
        spriteProperties: data.spriteProperties, spriteMapping: data.spriteMapping,
        tileset, spriteset,
        world, camera: scrollCamera,
        enemies: flatEnemies,
        hotSpots: worldHotSpots,
        player,
        map: data.map,
        backdrop,
        playSfx: (slot, loop = false, freq = 11025) => sfx.play(slot, loop, freq),
        stopSfx: (voice) => sfx.stopVoice(voice),
        onFrame: ({ frame }) => {
          if (frame % 60 === 0) {
            hud.textContent =
              `[scroll] obj ${player.objects}/${prefs.maxObjs} keys ${player.keys} lives ${player.lives}`;
          }
        },
      });
    } else {
      res = await engineDoGame({
        screen, keyboard, prefs, tileProperties: data.tileProperties,
        spriteProperties: data.spriteProperties, spriteMapping: data.spriteMapping,
        tileset, spriteset, map: data.map, enems: data.enems, hotSpots: data.hotSpots,
        player, curScreenBuff, flag: 1,
        playSfx: (slot, loop = false, freq = 11025) => sfx.play(slot, loop, freq),
        stopSfx: (voice) => sfx.stopVoice(voice),
        onFrame: ({ nPant, frame }) => {
          if (frame % 60 === 0) {
            hud.textContent =
              `Game — pant ${nPant} (${nPant % prefs.mapW},${Math.floor(nPant / prefs.mapW)}) frame ${frame & 3} ` +
              `| obj ${player.objects}/${prefs.maxObjs} keys ${player.keys} lives ${player.lives}`;
          }
        },
      });
    }

    console.log(`[main] engineDoGame returned ${res}`);
    await music.fadeOut(300).catch(() => {});
    await screen.fadeTo(0, 0, 0, 10).catch(() => {});
    music.stop();
    keyboard.clear();

    // Win → show ending before returning to title
    if (res === -1) {
      await showEnding(screen, music, keyboard);
      await screen.fadeTo(0, 0, 0, 10).catch(() => {});
    }

    // Show title again
    console.log("[main] returning to title");
    hud.textContent = "Title — press Enter / click";

    const titleRes2 = await showTitle(screen, keyboard, music, {
      titlePath: "/GFX/TITLE.PCX",
      musicPath: "/MUSIC/G66A.ogg",
      fadeFrames: 12,
    });
    console.log(`[main] title -> ${titleRes2.reason}`);
    config.scrollEnabled = titleRes2.scrollEnabled;
    await music.fadeOut(250).catch(() => {});
    await screen.fadeTo(0, 0, 0, 8).catch(() => {});
    keyboard.clear();
    screen.clearLayer(0);
    screen.clearLayer(1);
    screen.clearLayer(2);
    screen.clearLayer(3);
  }
}

main().catch((e) => {
  console.error("[main] FATAL:", e);
  hud.textContent = `Error: ${(e as Error).message}`;
  screen.clearLayer(0);
  screen.fillRect(0, 0, 0, 320, 200, 4);
  screen.present();
});
