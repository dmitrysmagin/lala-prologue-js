/**
 * Phase 11 — Ending screen (showEnding)
 * Port of LALA.BAS showEnding — ENDING.PCX + typewriter text.
 */
import { Screen, VIDEO, LAYER_1, LAYER_3 } from "../screen";
import { Keyboard } from "../keyboard";
import { PCXLoader } from "../assets/PCXLoader";
import { loadGameFont } from "../assets/fnt-cache";
import { dqbPrint } from "../engine/render";
import type { MusicPlayer } from "../audio/music-player";

const ENDING_TEXT = [
  ["YOU DID IT!", "GOT ALL THE", "POTIONS...", "WELL DONE!"],
  ["BUT THERE'S", "STILL MUCH", "TO DO!", "SEE YOU SOON!"],
];

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

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export async function showEnding(
  screen: Screen,
  musicPlayer?: MusicPlayer,
  keyboard?: Keyboard,
): Promise<void> {
  await loadGameFont("/GFX/lala.fnt").catch(() => null);
  const bma = await getBma();

  // Load ENDING.PCX
  let pcx: { width: number; height: number; data: Uint8Array; palette: Uint8Array | null } | null = null;
  try {
    const r = await fetch("/GFX/ENDING.PCX");
    if (r.ok) pcx = new PCXLoader().load(new Uint8Array(await r.arrayBuffer()));
  } catch { /* ignore */ }

  screen.clearLayer(VIDEO);
  screen.palOff();

  if (pcx) {
    if (pcx.palette) screen.setPal(pcx.palette);
    blitPcxToLayer(screen, LAYER_3, pcx, 0, 0);
  }

  screen.copyLayer(LAYER_3, LAYER_1);

  // Start music (MC12)
  if (musicPlayer) {
    try {
      const r = await fetch("/MUSIC/MC12.ogg", { method: "HEAD" });
      if (r.ok) await musicPlayer.loadSong("/MUSIC/MC12.ogg");
    } catch { /* muted */ }
  }

  screen.copyLayer(LAYER_1, VIDEO);
  screen.present();

  // Initial pause — 32 frames
  for (let d = 0; d < 32; d++) await nextFrame();

  // Two text passes
  for (let k = 0; k < 2; k++) {
    screen.copyLayer(LAYER_3, LAYER_1);
    // filterBox + border (QB: DQBfilterBox 1,16,16,135,95,255,1 + DQBbox 1,16,16,135,95,254)
    screen.filterBox(LAYER_1, 16, 16, 135, 95, 255, bma);
    screen.drawRect(LAYER_1, 16, 16, 135, 95, 254);

    let y = 24;
    for (let i = 0; i < 4; i++) {
      const text = ENDING_TEXT[k][i];
      let x = 24;
      for (let j = 0; j < text.length; j++) {
        const ch = text[j];
        // Shadow (color 255)
        dqbPrint(screen, LAYER_1, ch, x - 1, y - 1, 255);
        // Foreground (color 254)
        dqbPrint(screen, LAYER_1, ch, x, y, 254);
        // 8-frame delay per character
        for (let d = 0; d < 8; d++) await nextFrame();
        screen.copyLayer(LAYER_1, VIDEO);
        screen.present();
        x += 8;
      }
      y += 16;
      if (i === 2) y += 8; // extra gap after line 3
    }

    // 120-frame pause after text
    for (let d = 0; d < 120; d++) await nextFrame();
  }

  // Wait for any keypress or click
  await new Promise<void>((resolve) => {
    let resolved = false;
    let raf = 0;
    function done() { if (!resolved) { resolved = true; cancelAnimationFrame(raf); cleanup(); resolve(); } }
    function onClick() { done(); }
    function cleanup() {
      screen.canvas.removeEventListener("click", onClick);
      document.removeEventListener("click", onClick);
    }
    screen.canvas.addEventListener("click", onClick);
    document.addEventListener("click", onClick);

    if (keyboard) {
      function onFrame() {
        if (resolved) return;
        if (keyboard!.readKey() !== 0) { done(); return; }
        raf = requestAnimationFrame(onFrame);
      }
      raf = requestAnimationFrame(onFrame);
    }
  });

  if (musicPlayer) musicPlayer.stop();
  screen.clearLayer(VIDEO);
}
