/**
 * Phase 6 — Title screen (showTitle)
 * Shows TITLE.PCX, palette fade, blinking prompt.
 * Input: ANY keydown (Enter/Space/arrows/anything) or canvas click = start.
 * Does NOT depend on Keyboard class for input detection.
 */
import { Screen, VIDEO, LAYER_1, LAYER_3 } from "../screen";
import { PCXLoader } from "../assets/PCXLoader";
import type { MusicPlayer } from "../audio/music-player";

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
}

export async function showTitle(
  screen: Screen,
  _keyboard: unknown,
  musicPlayer?: MusicPlayer,
  opts?: { titlePath?: string; musicPath?: string; fadeFrames?: number },
): Promise<ShowTitleResult> {
  const titlePath = opts?.titlePath ?? "/GFX/TITLE.PCX";
  const musicPath = opts?.musicPath ?? "/MUSIC/G66A.ogg";
  const fadeFrames = opts?.fadeFrames ?? 16;

  // ---- Load TITLE.PCX ----
  let titlePcx: { width: number; height: number; data: Uint8Array; palette: Uint8Array | null } | null = null;
  try {
    const r = await fetch(titlePath);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    titlePcx = new PCXLoader().load(new Uint8Array(await r.arrayBuffer()));
    console.log(`[title] loaded ${titlePcx.width}x${titlePcx.height}`);
  } catch (e) {
    console.warn("[title] TITLE.PCX load failed", e);
  }

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

  // ---- BMA for filterBox ----
  let bma: Uint8Array | null = null;
  try {
    const r = await fetch("/GFX/LALA.BMA");
    if (r.ok) {
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.length >= 65536) bma = buf;
    }
  } catch { /* ignore */ }
  if (!bma) {
    bma = new Uint8Array(65536);
    for (let fg = 0; fg < 256; fg++)
      for (let bg = 0; bg < 256; bg++)
        bma[(fg << 8) | bg] = bg === 255 ? (fg * 0.6) | 0 : fg;
  }

  // ---- DOM overlay text ----
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;left:50%;top:52%;transform:translate(-50%,-50%);" +
    "font:14px monospace;font-weight:bold;letter-spacing:2px;text-align:center;" +
    "user-select:none;z-index:10;pointer-events:none;";
  overlay.innerHTML =
    '<div style="color:#000;transform:translate(1px,1px)">PRESS ENTER TO PLAY</div>' +
    '<div style="color:#0f0;margin-top:-14px">PRESS ENTER TO PLAY</div>' +
    '<div style="color:#fff;font-size:10px;margin-top:4px;opacity:0.7">(or click / any key)</div>';
  overlay.style.display = "none";
  document.body.appendChild(overlay);

  // ---- Wait for input, then resolve ----
  console.log("[title] waiting for input");

  return new Promise<ShowTitleResult>((resolve) => {
    let resolved = false;

    function start() {
      if (resolved) return;
      resolved = true;
      console.log("[title] input received — starting game");
      cleanup();
      resolve({ reason: "enter" });
    }

    // ANY keyboard key = start
    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      start();
    }
    // Canvas click = start
    function onClick() {
      start();
    }

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("keydown", onKeyDown, true);
    screen.canvas.addEventListener("click", onClick);
    document.addEventListener("click", onClick);
    screen.canvas.addEventListener("touchstart", onClick, { passive: true });

    let frame = 0;
    let shown = true;
    let raf = 0;

    function onFrame() {
      if (resolved) return;
      frame++;

      // Blink prompt every 32 frames
      const shouldShow = (Math.floor(frame / 32) % 2) === 0;
      if (shouldShow !== shown) {
        shown = shouldShow;
        overlay.style.display = shown ? "block" : "none";
        screen.copyLayer(LAYER_3, LAYER_1);
        screen.copyLayer(LAYER_1, VIDEO);
        if (shown) {
          screen.filterBox(VIDEO, 80, 136, 239, 151, 255, bma!);
        }
        screen.present();
      }

      if (frame % 60 === 0) screen.present();

      raf = requestAnimationFrame(onFrame);
    }

    raf = requestAnimationFrame(onFrame);

    // Focus canvas
    screen.canvas.tabIndex = 0;
    screen.canvas.focus();
    window.focus();

    function cleanup() {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keydown", onKeyDown, true);
      screen.canvas.removeEventListener("click", onClick);
      document.removeEventListener("click", onClick);
      screen.canvas.removeEventListener("touchstart", onClick);
      overlay.remove();
      // NOTE: palette fade handled by caller (main.ts), not here —
      // fire-and-forget fadeTo here raced with caller's fadeOut/fadeIn.
    }
  });
}
