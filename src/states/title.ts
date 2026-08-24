/**
 * Phase 6 — Title screen (showTitle)
 * Mirrors QB: DQBloadImage(3, TITLE.PCX) → DQBcopyLayer 3,1 → DQBcopyLayer 1,VIDEO
 * with palette fade, music (G66A.OGG), and "PRESS ENTER TO PLAY" prompt.
 * flag=0 title mode is simulated here without full engineDoGame (Phase 7)
 * — shows title image + blinking prompt + waits for Enter.
 */
import { Screen, VIDEO, LAYER_1, LAYER_3 } from "../screen";
import { Keyboard, SC_ENTER } from "../keyboard";
import { PCXLoader } from "../assets/PCXLoader";
import type { MusicPlayer } from "../audio/music-player";

// Simple helper to blit full-screen PCX centering within 320×200
function blitPcxToLayer(
  screen: Screen,
  layer: number,
  pcx: { width: number; height: number; data: Uint8Array },
  atX: number,
  atY: number,
  solid = true,
): void {
  // Fast path: if PCX is exactly 320×200, bulk copy row by row via putPixel? Use blitSheet path but
  // instead of tiling, we do direct indexed copy for speed.
  // For generic sizes, tile-copy via blitTileSolid would be per-tile overhead; use direct.
  const lutReady = true;
  void lutReady;
  // Direct copy: iterate pcx pixels, copy to layer if not transparent (when solid==false skip 0)
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
      const pal = src[sRow + x];
      if (!solid && pal === 0) continue;
      const di = dRow + px;
      dstIdx[di] = pal;
      dstU32[di] = lut[pal];
    }
  }
}

export interface ShowTitleResult {
  reason: "enter" | "music-failed";
}

export async function showTitle(
  screen: Screen,
  keyboard: Keyboard,
  musicPlayer?: MusicPlayer,
  opts?: { titlePath?: string; musicPath?: string; fadeFrames?: number },
): Promise<ShowTitleResult> {
  const titlePath = opts?.titlePath ?? "/GFX/TITLE.PCX";
  const musicPath = opts?.musicPath ?? "/MUSIC/G66A.OGG";
  const fadeFrames = opts?.fadeFrames ?? 16;

  // ---- Load TITLE.PCX onto LAYER_3 (QB: DQBloadImage(3, ...)) ----
  let titlePcx: { width: number; height: number; data: Uint8Array; palette: Uint8Array | null } | null = null;
  try {
    const r = await fetch(titlePath);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    titlePcx = new PCXLoader().load(bytes);
    console.log(`TITLE ${titlePcx.width}×${titlePcx.height} pal=${!!titlePcx.palette}`);
  } catch (e) {
    console.warn("showTitle: TITLE.PCX load failed, using placeholder", e);
  }

  // Palette handling — TITLE pal is canonical for title screen (QB loads pal from PCX)
  let savedPal: Uint8Array | null = null;
  if (titlePcx?.palette) {
    // Save current pal to restore later if needed, then fade in title pal
    savedPal = screen.getPal();
    screen.palOff();
    screen.present();
    // Install palette but start black for fadeIn
    // We call fadeIn which starts from black — give it the target pal directly
    await screen.fadeIn(titlePcx.palette, fadeFrames);
  } else if (titlePcx === null) {
    // Placeholder palette — already set
  }

  // Prepare layers
  screen.clearLayer(LAYER_3);
  screen.clearLayer(LAYER_1);
  screen.clearLayer(VIDEO);

  if (titlePcx) {
    blitPcxToLayer(screen, LAYER_3, titlePcx, 0, 0, true);
  } else {
    // Placeholder: checker + border
    screen.fillRect(LAYER_3, 0, 0, 320, 200, 1);
    screen.drawRect(LAYER_3, 0, 0, 319, 199, 15);
    screen.fillRect(LAYER_3, 80, 40, 160, 32, 4);
  }

  // QB: DQBcopyLayer 3,1 → DQBcopyLayer 1,VIDEO
  screen.copyLayer(LAYER_3, LAYER_1);
  screen.copyLayer(LAYER_1, VIDEO);
  screen.present();

  // ---- Music ----
  let musicFailed = false;
  if (musicPlayer) {
    try {
      // Try OGG first, then fallback to S3M stub if 404 (no throw)
      let url = musicPath;
      let resp = await fetch(url, { method: "HEAD" });
      if (!resp.ok) {
        const alt = url.replace(/\.OGG$/i, ".S3M");
        const altResp = await fetch(alt, { method: "HEAD" });
        if (altResp.ok) {
          console.warn(`Music OGG not found (${url}), S3M present but OGG pipeline not yet run — muting.`);
          musicFailed = true;
        } else {
          console.warn(`Music not found: ${url} nor ${alt} — muted.`);
          musicFailed = true;
        }
      }
      if (!musicFailed) {
        await musicPlayer.loadSong(url);
      }
    } catch (e) {
      console.warn("showTitle music failed", e);
      musicFailed = true;
    }
  }

  // ---- Prompt loop — flag=0 title mode ----
  // Render "PRESS ENTER TO PLAY" with filterBox + double print (shadow)
  // Since font engine not yet ported (FNT), use overlay DOM + filterBox rect.
  // We render a rect with filterBox darken then two text layers via DOM.
  // Also blink every 32 frames.

  // Create DOM overlay for text (since LALA.FNT renderer is Phase 11)
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;left:50%;top:52%;transform:translate(-50%,-50%);pointer-events:none;" +
    "font: 14px monospace; font-weight:bold; letter-spacing:2px; text-align:center;";
  overlay.innerHTML =
    `<div style="color:#000;transform:translate(1px,1px)">PRESS ENTER TO PLAY</div>` +
    `<div style="color:#0f0;margin-top:-14px">PRESS ENTER TO PLAY</div>`;
  overlay.style.display = "none";
  document.body.appendChild(overlay);

  // Optional canvas text fallback (if DOM overlay blocked)
  const useDomOverlay = true;

  // BMA for filterBox darken — try load LALA.BMA (64K), else mock
  let bma: Uint8Array | null = null;
  try {
    const r = await fetch("/GFX/LALA.BMA");
    if (r.ok) {
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.length >= 65536) bma = buf;
      else if (buf.length === 256 * 2) { /* wrong file */ }
      console.log(`BMA ${buf.length} bytes`);
    }
  } catch { /* ignore */ }
  if (!bma) {
    bma = new Uint8Array(65536);
    for (let fg = 0; fg < 256; fg++) for (let bg = 0; bg < 256; bg++) bma[(fg << 8) | bg] = bg === 255 ? (fg * 0.6) | 0 : fg;
  }

  keyboard.clear();
  let frame = 0;
  let shown = true;

  return await new Promise<ShowTitleResult>((resolve) => {
    const onFrame = () => {
      frame++;

      // Blink prompt every 32 frames (half on/off) — like QB halfLife
      const shouldShow = (Math.floor(frame / 32) % 2) === 0;
      if (shouldShow !== shown) {
        shown = shouldShow;
        overlay.style.display = shown ? "block" : "none";
        // Restore title image before re-applying filter
        screen.copyLayer(LAYER_3, LAYER_1);
        screen.copyLayer(LAYER_1, VIDEO);
        if (shown) {
          // DQBfilterBox 1, 80,136,239,151,255,1 then DQBprint shadow
          // Approx rect for text (80,136)-(239,151)
          screen.filterBox(VIDEO, 80, 136, 239, 151, 255, bma!);
          // Canvas fallback text if DOM not used
          if (!useDomOverlay) {
            // crude: fill rects for letters
            screen.fillRect(VIDEO, 88, 140, 140, 8, 1);
            screen.drawRect(VIDEO, 88, 140, 228, 148, 15);
          }
        }
        screen.present();
      }

      // Keep VIDEO refreshed each frame (for palette fade stability)
      if (frame % 60 === 0) screen.present();

      if (keyboard.isDown(SC_ENTER) || keyboard.readKey() === SC_ENTER) {
        cleanup();
        resolve({ reason: "enter" });
        return;
      }
      // Allow detach to resolve if needed externally
      if ((onFrame as unknown as { _abort?: boolean })._abort) {
        cleanup();
        resolve({ reason: "enter" });
        return;
      }
      raf = requestAnimationFrame(onFrame);
    };

    const cleanup = () => {
      cancelAnimationFrame(raf);
      overlay.remove();
      // Fade out title before returning (like QB palette fade)
      // Don't await here — caller will transition
      screen.fadeTo(0, 0, 0, 10).catch(() => {});
      if (savedPal) {
        // Restore pal after fade for next scene; actual game will set its own
        // (keep faded black for now)
      }
    };

    let raf = requestAnimationFrame(onFrame);
    // Ensure keyboard focus
    const c = document.getElementById("gameCanvas") as HTMLCanvasElement | null;
    if (c) { c.tabIndex = 0; c.focus(); }
  });
}
