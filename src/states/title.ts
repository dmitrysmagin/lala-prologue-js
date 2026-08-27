/**
 * Phase 6 — Title screen (showTitle)
 * Shows TITLE.PCX, palette fade, "PRESS ENTER TO PLAY" prompt rendered
 * on-canvas using FNT font + filterBox transparent shading.
 * Input: ANY keydown (Enter/Space/arrows/anything) or canvas click = start.
 */
import { Screen, VIDEO, LAYER_1, LAYER_3 } from "../screen";
import { Keyboard, SC_LEFT, SC_RIGHT, SC_ENTER } from "../keyboard";
import { PCXLoader } from "../assets/PCXLoader";
import { loadGameFont } from "../assets/fnt-cache";
import { dqbPrint } from "../engine/render";
import type { MusicPlayer } from "../audio/music-player";
import { config } from "../engine/config";

/** BMA blender map for filterBox — cached after first fetch */
let _bmaCache: Uint8Array | null = null;
async function getBma(): Promise<Uint8Array> {
  if (_bmaCache) return _bmaCache;
  try {
    const r = await fetch("/GFX/LALA.BMA");
    if (r.ok) {
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.length >= 65536) { _bmaCache = buf; return buf; }
    }
  } catch { /* ignore */ }
  // Mock darken fallback
  const bma = new Uint8Array(65536);
  for (let fg = 0; fg < 256; fg++)
    for (let bg = 0; bg < 256; bg++)
      bma[(fg << 8) | bg] = bg === 255 ? (fg * 0.6) | 0 : fg;
  _bmaCache = bma;
  return bma;
}

function blitPcxToLayer(
  screen: Screen,
  layer: number,
  pcx: { width: number; height: number; data: Uint8Array },
  atX: number,
  atY: number,
): void {
  const dstIdx = screen.getLayerIndices(layer);
  const dstU32 = screen.getLayerU32(layer);
  const lut = screen.getPaletteLut();
  const sw = pcx.width, sh = pcx.height;
  const src = pcx.data;
  for (let y = 0; y < sh; y++) {
    const py = atY + y;
    if (py < 0 || py >= 200) continue;
    const dRow = py * 320;
    const sRow = y * sw;
    for (let x = 0; x < sw; x++) {
      const px = atX + x;
      if (px < 0 || px >= 320) continue;
      const di = dRow + px;
      dstIdx[di] = src[sRow + x];
      dstU32[di] = lut[src[sRow + x]];
    }
  }
}

export interface ShowTitleResult {
  reason: "enter";
  scrollEnabled: boolean;
}

export async function showTitle(
  screen: Screen,
  keyboard: Keyboard,
  musicPlayer?: MusicPlayer,
  opts?: { titlePath?: string; musicPath?: string; fadeFrames?: number },
): Promise<ShowTitleResult> {
  const titlePath = opts?.titlePath ?? "/GFX/TITLE.PCX";
  const musicPath = opts?.musicPath ?? "/MUSIC/G66A.ogg";
  const fadeFrames = opts?.fadeFrames ?? 16;

  // ---- Load TITLE.PCX + FNT font in parallel ----
  const [titlePcx] = await Promise.all([
    (async () => {
      try {
        const r = await fetch(titlePath);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const pcx = new PCXLoader().load(new Uint8Array(await r.arrayBuffer()));
        console.log(`[title] loaded ${pcx.width}x${pcx.height}`);
        return pcx;
      } catch (e) {
        console.warn("[title] TITLE.PCX load failed", e);
        return null;
      }
    })(),
    loadGameFont("/GFX/lala.fnt").catch(() => null),
  ]);

  screen.clearLayer(LAYER_3);
  screen.clearLayer(LAYER_1);
  screen.clearLayer(VIDEO);

  if (titlePcx) {
    if (titlePcx.palette) screen.setPal(titlePcx.palette);
    blitPcxToLayer(screen, LAYER_3, titlePcx, 0, 0);
  } else {
    screen.fillRect(LAYER_3, 0, 0, 320, 200, 1);
    screen.drawRect(LAYER_3, 0, 0, 319, 199, 15);
  }

  screen.copyLayer(LAYER_3, LAYER_1);
  screen.copyLayer(LAYER_1, VIDEO);

  // Fade in
  if (titlePcx?.palette) {
    screen.palOff();
    screen.refreshAllFromIndices();
    screen.present();
    await screen.fadeIn(titlePcx.palette, fadeFrames);
    screen.present();
  } else {
    screen.present();
  }

  // ---- Music (non-blocking, fire-and-forget) ----
  if (musicPlayer) {
    fetch(musicPath, { method: "HEAD" }).then((r) => {
      if (r.ok) musicPlayer.loadSong(musicPath).catch(() => {});
    }).catch(() => {});
  }

  // ---- Pre-load BMA for filterBox (blocks briefly, ~instant from cache) ----
  const bma = await getBma();

  // ---- Wait for input, render "PRESS ENTER TO PLAY" each frame ----
  console.log("[title] waiting for input");

  return new Promise<ShowTitleResult>((resolve) => {
    let resolved = false;

    function start() {
      if (resolved) return;
      resolved = true;
      console.log("[title] input received — starting game");
      cleanup();
      resolve({ reason: "enter", scrollEnabled: config.scrollEnabled });
    }

    function toggleMode() {
      config.scrollEnabled = !config.scrollEnabled;
      console.log("[title] game mode:", config.scrollEnabled ? "scrolling" : "flip-screen");
    }

    function onClick() {
      start();
    }

    screen.canvas.addEventListener("click", onClick);
    document.addEventListener("click", onClick);
    screen.canvas.addEventListener("touchstart", onClick, { passive: true });

    let raf = 0;

    function onFrame() {
      if (resolved) return;

      // Poll keyboard — single global listener in Keyboard class
      if (keyboard.justPressed(SC_LEFT) || keyboard.justPressed(SC_RIGHT)) toggleMode();
      if (keyboard.justPressed(SC_ENTER) || keyboard.isDown(0x39)) start(); // 0x39 = Space
      keyboard.clearJustPressed();

      // Redraw title background each frame (clean slate for filterBox)
      screen.copyLayer(LAYER_3, LAYER_1);

      // Game mode toggle — above the "PRESS ENTER" box
      const modeLabel = config.scrollEnabled ? "GAME MODE: SCROLLING" : "GAME MODE: FLIP-SCREEN";
      // Shadow
      dqbPrint(screen, LAYER_1, modeLabel, 88, 120, 0);
      // Foreground
      dqbPrint(screen, LAYER_1, modeLabel, 87, 119, 1);

      // FilterBox + text (matches QB: DQBfilterBox 1, 80, 136, 239, 151, 255, 1)
      screen.filterBox(LAYER_1, 80, 136, 239, 151, 255, bma);
      // Shadow: DQBprint 1, "PRESS ENTER TO PLAY", 89, 141, 0
      dqbPrint(screen, LAYER_1, "PRESS ENTER TO PLAY", 89, 141, 0);
      // Foreground: DQBprint 1, "PRESS ENTER TO PLAY", 88, 140, 1
      dqbPrint(screen, LAYER_1, "PRESS ENTER TO PLAY", 88, 140, 1);

      screen.copyLayer(LAYER_1, VIDEO);
      screen.present();

      raf = requestAnimationFrame(onFrame);
    }

    raf = requestAnimationFrame(onFrame);

    screen.canvas.tabIndex = 0;
    screen.canvas.focus();
    window.focus();

    function cleanup() {
      cancelAnimationFrame(raf);
      screen.canvas.removeEventListener("click", onClick);
      document.removeEventListener("click", onClick);
      screen.canvas.removeEventListener("touchstart", onClick);
    }
  });
}
