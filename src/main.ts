import { Screen } from "./screen";
import { Keyboard } from "./keyboard";
import { showTitle } from "./states/title";
import { MusicPlayer } from "./audio/music-player";
import { createDefaultPrefs } from "./engine/prefs";
import { createPlayer } from "./engine/prefs";
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
} from "./engine/map";
import { engineDoGame } from "./engine/game-loop";

const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const screen = new Screen(canvas);
const keyboard = new Keyboard(window);
const music = new MusicPlayer();

const hud = document.createElement("div");
hud.style.cssText = "position:fixed;bottom:8px;left:50%;transform:translateX(-50%);color:#0f0;background:rgba(0,0,0,0.6);padding:6px 10px;font:11px monospace;white-space:pre;text-align:center;pointer-events:none";
hud.textContent = "Init…";
document.body.appendChild(hud);

async function startup() {
  canvas.tabIndex = 0;
  canvas.focus();
  canvas.addEventListener("click", () => canvas.focus());
  await music.init().catch(() => {});
}

async function loadGameData() {
  const prefs = createDefaultPrefs();
  // Game music is DESORUIN, title is G66A per prefs — keep prefs.bgM for loop, but swap as needed
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
  if (tilesetSheet.palette) screen.setPal(tilesetSheet.palette);
  else if (prefs.pal) screen.setPal(prefs.pal);
  return { prefs, tileProperties, spriteProperties, spriteMapping, tilesetSheet, spritesetSheet, map, enems, hotSpots };
}

async function main() {
  await startup();

  // Pre-load shared data once (palette, map, tiles) — reused across title↔game loops
  hud.textContent = "Loading…";
  const data = await loadGameData();
  const player = createPlayer(data.prefs);
  const curScreenBuff = createCurScreenBuff();

  // Outer full loop: Title → Play → (Ending) → Title
  // For Phase 7, Ending not yet; loop Title↔Game
  while (true) {
    // ---- Title ----
    hud.textContent = "Title — press Enter";
    const titleRes = await showTitle(screen, keyboard, music, {
      titlePath: "/GFX/TITLE.PCX",
      musicPath: "/MUSIC/G66A.OGG",
      fadeFrames: 12,
    });
    console.log(`title -> ${titleRes.reason}`);
    await music.fadeOut(250).catch(() => {});
    await screen.fadeTo(0, 0, 0, 8).catch(() => {});
    keyboard.clear();
    screen.clearLayer(0); screen.clearLayer(1); screen.clearLayer(2); screen.clearLayer(3);

    // ---- Game ----
    // Reset player per engineInitGame / engineInitPlayer
    const prefs = data.prefs;
    // Re-init player for new game
    const fresh = createPlayer(prefs);
    Object.assign(player, fresh);
    player.lives = prefs.initialLives;
    player.keys = 0; player.objects = 0; player.gameOver = 0;
    // Restore hotspots s flags (they were mutated)
    for (const hs of data.hotSpots) hs.s = true;
    // Palette already set to tileset; fade in
    await screen.fadeIn(screen.getPal().length ? screen.getPal() : data.tilesetSheet.palette!, 10);
    try {
      const r = await fetch("/MUSIC/DESORUIN.OGG", { method: "HEAD" });
      if (r.ok) await music.loadSong("/MUSIC/DESORUIN.OGG");
      else console.warn("Game music OGG missing — muted");
    } catch { /* muted */ }

    hud.textContent = `Game — pant ${prefs.iniPant} ←/→/↑ / Ctrl  W+E+R cheat`;

    const tileset = { width: data.tilesetSheet.width, height: data.tilesetSheet.height, data: data.tilesetSheet.data, palette: data.tilesetSheet.palette };
    const spriteset = { width: data.spritesetSheet.width, height: data.spritesetSheet.height, data: data.spritesetSheet.data, palette: data.spritesetSheet.palette };

    const res = await engineDoGame({
      screen,
      keyboard,
      prefs,
      tileProperties: data.tileProperties,
      spriteProperties: data.spriteProperties,
      spriteMapping: data.spriteMapping,
      tileset,
      spriteset,
      map: data.map,
      enems: data.enems,
      hotSpots: data.hotSpots,
      player,
      curScreenBuff,
      flag: 1,
      onFrame: ({ nPant, frame }) => {
        if (frame % 60 === 0) {
          hud.textContent =
            `Game — pant ${nPant} (${nPant % prefs.mapW},${Math.floor(nPant / prefs.mapW)}) frame ${frame & 3} ` +
            `| obj ${player.objects}/${prefs.maxObjs} keys ${player.keys} lives ${player.lives} | Enter→Title`;
        }
      },
    });

    console.log(`engineDoGame returned ${res}`);
    await music.fadeOut(300).catch(() => {});
    await screen.fadeTo(0, 0, 0, 10).catch(() => {});
    music.stop();
    keyboard.clear();

    if (res === -1) {
      hud.textContent = "You win! (Ending Phase 11 not yet) — returning to title…";
      await new Promise<void>((r) => setTimeout(r, 1500));
      // Will loop to title again; Phase 11 will show ending instead
      continue;
    }
    if (res === -2) {
      hud.textContent = "Game Over — returning to title…";
      await new Promise<void>((r) => setTimeout(r, 1500));
      continue;
    }
    if (res === 0 || res === -3) {
      // ESC / -3 — back to title
      continue;
    }
  }
}

main().catch((e) => {
  console.error(e);
  hud.textContent = `Error: ${(e as Error).message}`;
  screen.clearLayer(0);
  screen.fillRect(0, 0, 0, 320, 200, 4);
  screen.present();
});
