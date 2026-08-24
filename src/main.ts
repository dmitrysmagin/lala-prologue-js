import { Screen, VIDEO, LAYER_1, LAYER_2, LAYER_3 } from "./screen";

const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const screen = new Screen(canvas);

// --- Build a demo 256-colour palette (rainbow + greys) ---
const demoPal = new Uint8Array(768);
for (let i = 0; i < 256; i++) {
  // Simple HSV-ish ramp
  demoPal[i * 3] = (i * 4) & 0xff;        // R scaled later inside setPal
  demoPal[i * 3 + 1] = (255 - i) & 0xff;   // G
  demoPal[i * 3 + 2] = ((i * 7) & 0xff);   // B
}
// Make colour 0 = black, 15 = white, 254/255 reserved for BMA effects
demoPal[0] = 0; demoPal[1] = 0; demoPal[2] = 0;
demoPal[15 * 3] = 255; demoPal[15 * 3 + 1] = 255; demoPal[15 * 3 + 2] = 255;
demoPal[254 * 3] = 48; demoPal[254 * 3 + 1] = 48; demoPal[254 * 3 + 2] = 48; // brighten key
demoPal[255 * 3] = 12; demoPal[255 * 3 + 1] = 12; demoPal[255 * 3 + 2] = 12; // darken key

screen.setPal(demoPal);

// --- Phase-2 API smoke test ---
// 1. clear + fillRect on LAYER_1
screen.clearLayer(VIDEO);
screen.clearLayer(LAYER_1);
screen.clearLayer(LAYER_2);
screen.clearLayer(LAYER_3);

screen.fillRect(LAYER_1, 0, 0, 320, 200, 1);          // background
screen.fillRect(LAYER_1, 20, 20, 100, 60, 32);         // block A
screen.drawRect(LAYER_1, 20, 20, 119, 79, 15);         // outline

// 2. putPixel diagonal on LAYER_2
for (let i = 0; i < 64; i++) screen.putPixel(LAYER_2, 140 + i, 40 + i, (i * 4) & 0xff);

// 3. copyLayer LAYER_1 → VIDEO and LAYER_2 → VIDEO (layered)
screen.copyLayer(LAYER_1, VIDEO);
// transparent blit is Phase 3; for now overdraw LAYER_2 pixels where non-zero
{
  const srcIdx = screen.getLayerIndices(LAYER_2);
  const srcU32 = screen.getLayerU32(LAYER_2);
  const dstIdx = screen.getLayerIndices(VIDEO);
  const dstU32 = screen.getLayerU32(VIDEO);
  for (let i = 0; i < 320 * 200; i++) {
    if (srcIdx[i] !== 0) { dstIdx[i] = srcIdx[i]; dstU32[i] = srcU32[i]; }
  }
}

// 4. filterBox demo — build an identity + darken BMA mock (col 255 = darken)
const bma = new Uint8Array(65536);
for (let fg = 0; fg < 256; fg++) {
  for (let bg = 0; bg < 256; bg++) {
    // identity except col 255 darkens by ~40%
    if (bg === 255) bma[(fg << 8) | bg] = (fg * 0.6) | 0;
    else if (bg === 254) bma[(fg << 8) | bg] = Math.min(255, (fg * 1.25) | 0);
    else bma[(fg << 8) | bg] = fg;
  }
}
screen.filterBox(VIDEO, 30, 30, 110, 70, 255, bma);
screen.filterBox(VIDEO, 140, 40, 203, 103, 254, bma);

// 5. palette ops: exercise getPal / palOff / fadeIn without blocking
const savedPal = screen.getPal();
console.log("Phase 2: palette entries", savedPal.length, "VIDEO present");
screen.present();
screen.start(); // RAF loop at 60fps

// Demo fades after a pause (non-blocking)
setTimeout(async () => {
  console.log("Phase 2: fadeTo black");
  await screen.fadeTo(0, 0, 0, 12);
  console.log("Phase 2: fadeIn");
  await screen.fadeIn(savedPal, 16);
  console.log("LaLa Phase 2 — Virtual VGA ready (VIDEO/LAYER_1..3, palette, filterBox, RAF)");
}, 800);

// Keep reference to avoid GC
void LAYER_3;
