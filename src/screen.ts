/**
 * Virtual VGA — Phase 2
 * Wraps multiple offscreen ImageData buffers (320×200 RGBA each).
 * Layer model matches DirectQB: VIDEO (0), LAYER_1..LAYER_3.
 * Includes palette system (768-byte VGA pal → Uint32 RGBA LUT) and
 * RAF-driven blit.
 */

export const SCREEN_WIDTH = 320;
export const SCREEN_HEIGHT = 200;
export const SCREEN_SIZE = SCREEN_WIDTH * SCREEN_HEIGHT;

// Layer IDs — mirrors DirectQB layer concept
export const VIDEO = 0;
export const LAYER_1 = 1;
export const LAYER_2 = 2;
export const LAYER_3 = 3;
export const NUM_LAYERS = 4;

// ---------------------------------------------------------------------------
// Palette helpers
// ---------------------------------------------------------------------------

/**
 * Convert a 768-byte palette (R,G,B each 0-255, or 0-63 if already expanded
 * by setPal) to a Uint32Array(256) RGBA lookup. Little-endian:
 * R | G<<8 | B<<16 | 0xFF<<24. No scaling here — scaling for 6-bit VGA
 * palettes is done once in setPal/fadeIn.
 */
export function paletteBytesToRgba(pal: Uint8Array): Uint32Array {
  if (pal.length < 768) throw new Error(`paletteBytesToRgba: expected 768 bytes, got ${pal.length}`);
  const lut = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    const r = pal[i * 3] & 0xff;
    const g = pal[i * 3 + 1] & 0xff;
    const b = pal[i * 3 + 2] & 0xff;
    lut[i] = r | (g << 8) | (b << 16) | (0xff << 24);
  }
  return lut;
}

export function rgbaToPaletteBytes(lut: Uint32Array): Uint8Array {
  const pal = new Uint8Array(768);
  for (let i = 0; i < 256; i++) {
    const v = lut[i];
    pal[i * 3] = v & 0xff;
    pal[i * 3 + 1] = (v >> 8) & 0xff;
    pal[i * 3 + 2] = (v >> 16) & 0xff;
  }
  return pal;
}



// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export class Screen {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  /** RGBA buffers — one ImageData per layer */
  private layers: ImageData[] = [];
  /** Uint32 view onto each ImageData's buffer for fast writes */
  private layerU32: Uint32Array[] = [];
  /** Indexed (palette index) backing store per layer — needed for filterBox/BMA */
  private layerIdx: Uint8Array[] = [];

  /** Current palette as RGBA LUT (256 entries) */
  private paletteLut: Uint32Array = new Uint32Array(256);
  /** Raw 768-byte VGA palette (8-bit scaled 0-255) */
  private paletteBytes: Uint8Array = new Uint8Array(768);

  private rafId: number | null = null;
  private running = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Screen: failed to get 2D context");
    this.ctx = ctx;

    // Ensure canvas logical size is 320x200
    canvas.width = SCREEN_WIDTH;
    canvas.height = SCREEN_HEIGHT;

    for (let i = 0; i < NUM_LAYERS; i++) {
      const img = new ImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
      this.layers.push(img);
      this.layerU32.push(new Uint32Array(img.data.buffer));
      this.layerIdx.push(new Uint8Array(SCREEN_SIZE));
    }

    // Default palette: black (all entries transparent-black until setPal)
    // Keep alpha opaque black so clear is visible.
    for (let i = 0; i < 256; i++) this.paletteLut[i] = 0xff000000;
    // Entry 0 is transparent convention — keep black but layerIdx 0 = transparent
  }

  // -------------------------------------------------------------------------
  // Layer ops
  // -------------------------------------------------------------------------

  clearLayer(id: number): void {
    this.assertLayer(id);
    this.layerU32[id].fill(0);
    this.layerIdx[id].fill(0);
    // Also clear ImageData bytes (Uint32 fill already did)
  }

  copyLayer(src: number, dst: number): void {
    this.assertLayer(src);
    this.assertLayer(dst);
    if (src === dst) return;
    this.layerU32[dst].set(this.layerU32[src]);
    this.layerIdx[dst].set(this.layerIdx[src]);
  }

  /**
   * Put a single pixel using a palette index.
   * Index 0 is treated as opaque black here; transparency is handled at
   * blit time (Phase 3). For Phase 2 we write the RGBA value directly.
   */
  putPixel(layerId: number, x: number, y: number, palIndex: number): void {
    if (x < 0 || x >= SCREEN_WIDTH || y < 0 || y >= SCREEN_HEIGHT) return;
    this.assertLayer(layerId);
    const idx = y * SCREEN_WIDTH + x;
    const ci = palIndex & 0xff;
    this.layerIdx[layerId][idx] = ci;
    this.layerU32[layerId][idx] = this.paletteLut[ci];
  }

  /** Direct RGBA put (no palette lookup) — useful for tests */
  putPixelRgba(layerId: number, x: number, y: number, rgba: number): void {
    if (x < 0 || x >= SCREEN_WIDTH || y < 0 || y >= SCREEN_HEIGHT) return;
    this.assertLayer(layerId);
    const idx = y * SCREEN_WIDTH + x;
    this.layerU32[layerId][idx] = rgba;
    // Keep index in sync as 0 (unknown); filterBox will fallback to RGBA path
    this.layerIdx[layerId][idx] = 0;
  }

  fillRect(layerId: number, x: number, y: number, w: number, h: number, palIndex: number): void {
    this.assertLayer(layerId);
    const ci = palIndex & 0xff;
    const rgba = this.paletteLut[ci];
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(SCREEN_WIDTH, x + w);
    const y1 = Math.min(SCREEN_HEIGHT, y + h);
    if (x0 >= x1 || y0 >= y1) return;
    const idxStore = this.layerIdx[layerId];
    const u32 = this.layerU32[layerId];
    for (let py = y0; py < y1; py++) {
      const row = py * SCREEN_WIDTH;
      for (let px = x0; px < x1; px++) {
        const idx = row + px;
        idxStore[idx] = ci;
        u32[idx] = rgba;
      }
    }
  }

  drawRect(layerId: number, x1: number, y1: number, x2: number, y2: number, palIndex: number): void {
    // Normalize
    const xa = Math.min(x1, x2);
    const xb = Math.max(x1, x2);
    const ya = Math.min(y1, y2);
    const yb = Math.max(y1, y2);
    // Top / bottom
    this.fillRect(layerId, xa, ya, xb - xa + 1, 1, palIndex);
    this.fillRect(layerId, xa, yb, xb - xa + 1, 1, palIndex);
    // Left / right (avoid double-corners)
    if (yb - ya >= 2) {
      this.fillRect(layerId, xa, ya + 1, 1, yb - ya - 1, palIndex);
      this.fillRect(layerId, xb, ya + 1, 1, yb - ya - 1, palIndex);
    }
  }

  /**
   * Apply a blender map (256×256 LUT) to a rectangular region.
   * `bmap` is 65536 bytes where result = bmap[fg * 256 + blendCol].
   * Operates on the indexed backing store, then refreshes RGBA via palette.
   * Mirrors DQB filterBox / LALA.BMA usage for colours 254 (brighten) / 255 (darken).
   */
  filterBox(
    layerId: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    blendCol: number,
    bmap: Uint8Array,
  ): void {
    this.assertLayer(layerId);
    if (bmap.length < 65536) throw new Error(`filterBox: bmap expected 65536 bytes, got ${bmap.length}`);
    const xa = Math.max(0, Math.min(x1, x2));
    const xb = Math.min(SCREEN_WIDTH - 1, Math.max(x1, x2));
    const ya = Math.max(0, Math.min(y1, y2));
    const yb = Math.min(SCREEN_HEIGHT - 1, Math.max(y1, y2));
    const col = blendCol & 0xff;
    const idxStore = this.layerIdx[layerId];
    const u32 = this.layerU32[layerId];
    const lut = this.paletteLut;
    for (let py = ya; py <= yb; py++) {
      const row = py * SCREEN_WIDTH;
      for (let px = xa; px <= xb; px++) {
        const idx = row + px;
        const fg = idxStore[idx];
        const mapped = bmap[(fg << 8) | col];
        idxStore[idx] = mapped;
        u32[idx] = lut[mapped];
      }
    }
  }

  // -------------------------------------------------------------------------
  // Phase 3 — Sprite / tile blitter
  // -------------------------------------------------------------------------

  /**
   * Generic sheet type — compatible with PCXImage from assets.
   * `data` is a flat 8-bit indexed buffer (palette index per pixel).
   */
  private blitSheet(
    layerId: number,
    sheet: { width: number; height: number; data: Uint8Array },
    tileW: number,
    tileH: number,
    tileIndex: number,
    dx: number,
    dy: number,
    offsetX: number,
    offsetY: number,
    transparent: boolean,
  ): void {
    this.assertLayer(layerId);
    const cols = Math.floor(sheet.width / tileW);
    if (cols <= 0) throw new Error(`blitSheet: sheet width ${sheet.width} < tileW ${tileW}`);
    const sx0 = (tileIndex % cols) * tileW;
    const sy0 = Math.floor(tileIndex / cols) * tileH;
    if (sy0 + tileH > sheet.height) return; // out of bounds tile — no-op

    // Apply sprite offset (from SPRPROP.TXT) before clipping
    const dstX0 = dx + offsetX;
    const dstY0 = dy + offsetY;

    const lut = this.paletteLut;
    const dstIdx = this.layerIdx[layerId];
    const dstU32 = this.layerU32[layerId];
    const src = sheet.data;
    const sheetW = sheet.width;

    for (let y = 0; y < tileH; y++) {
      const py = dstY0 + y;
      if (py < 0 || py >= SCREEN_HEIGHT) continue;
      const dstRow = py * SCREEN_WIDTH;
      const srcRow = (sy0 + y) * sheetW + sx0;
      for (let x = 0; x < tileW; x++) {
        const px = dstX0 + x;
        if (px < 0 || px >= SCREEN_WIDTH) continue;
        const pal = src[srcRow + x];
        if (transparent && pal === 0) continue; // DQBsetTransPut
        const di = dstRow + px;
        dstIdx[di] = pal;
        dstU32[di] = lut[pal];
      }
    }
  }

  /** Copy a 16×16 tile. Index 0 is transparent (skipped). */
  blitTile(
    layerId: number,
    tileset: { width: number; height: number; data: Uint8Array },
    tileIndex: number,
    screenX: number,
    screenY: number,
  ): void {
    this.blitSheet(layerId, tileset, 16, 16, tileIndex, screenX, screenY, 0, 0, true);
  }

  /** Solid (no transparency) tile — mirrors DQBsetSolidPut */
  blitTileSolid(
    layerId: number,
    tileset: { width: number; height: number; data: Uint8Array },
    tileIndex: number,
    screenX: number,
    screenY: number,
  ): void {
    this.blitSheet(layerId, tileset, 16, 16, tileIndex, screenX, screenY, 0, 0, false);
  }

  /**
   * Copy a 24×24 sprite with optional per-sprite offset (from SPRPROP.TXT).
   * `spriteProps` is an array indexed by spriteIndex containing {offX, offY}.
   * Transparency: palette index 0 skipped (DQBsetTransPut).
   */
  blitSprite(
    layerId: number,
    spriteset: { width: number; height: number; data: Uint8Array },
    spriteIndex: number,
    screenX: number,
    screenY: number,
    spriteProps?: { offX: number; offY: number }[],
  ): void {
    const off = spriteProps?.[spriteIndex] ?? { offX: 0, offY: 0 };
    this.blitSheet(layerId, spriteset, 24, 24, spriteIndex, screenX, screenY, off.offX, off.offY, true);
  }

  /**
   * Copy a rectangle between layers (or within same layer).
   * Mirrors DQBput / DQBget semantics: copies both indexed and RGBA buffers.
   * Source and dest rectangles are clipped to screen bounds.
   */
  blitFromLayer(
    srcLayer: number,
    dstLayer: number,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
  ): void {
    this.assertLayer(srcLayer);
    this.assertLayer(dstLayer);
    if (sw <= 0 || sh <= 0) return;

    const srcIdx = this.layerIdx[srcLayer];
    const srcU32 = this.layerU32[srcLayer];
    const dstIdx = this.layerIdx[dstLayer];
    const dstU32 = this.layerU32[dstLayer];

    // Clip source rect to source bounds and dest to screen — simple per-pixel bounds check
    for (let y = 0; y < sh; y++) {
      const sy2 = sy + y;
      const dy2 = dy + y;
      if (sy2 < 0 || sy2 >= SCREEN_HEIGHT || dy2 < 0 || dy2 >= SCREEN_HEIGHT) continue;
      const sRow = sy2 * SCREEN_WIDTH;
      const dRow = dy2 * SCREEN_WIDTH;
      for (let x = 0; x < sw; x++) {
        const sx2 = sx + x;
        const dx2 = dx + x;
        if (sx2 < 0 || sx2 >= SCREEN_WIDTH || dx2 < 0 || dx2 >= SCREEN_WIDTH) continue;
        const si = sRow + sx2;
        const di = dRow + dx2;
        dstIdx[di] = srcIdx[si];
        dstU32[di] = srcU32[si];
      }
    }
  }

  // -------------------------------------------------------------------------
  // Palette system
  // -------------------------------------------------------------------------

  /** Set palette from a precomputed RGBA LUT (256 entries) */
  setPalette(rgbaLut: Uint32Array): void {
    if (rgbaLut.length !== 256) throw new Error(`setPalette: expected 256 entries, got ${rgbaLut.length}`);
    this.paletteLut.set(rgbaLut);
    this.paletteBytes.set(rgbaToPaletteBytes(rgbaLut));
  }

  /** Set palette from 768 raw bytes (R,G,B per entry, 0-255 or 0-63) */
  setPal(palBytes: Uint8Array): void {
    if (palBytes.length < 768) throw new Error(`setPal: expected 768 bytes, got ${palBytes.length}`);
    // Detect 0-63 range vs 0-255: if max <= 63 we scale
    let max = 0;
    for (let i = 0; i < 768; i++) if (palBytes[i] > max) max = palBytes[i];
    const src = max <= 63 ? (() => {
      const scaled = new Uint8Array(768);
      for (let i = 0; i < 768; i++) scaled[i] = (palBytes[i] * 255 / 63) | 0;
      return scaled;
    })() : palBytes;

    this.paletteBytes.set(src.subarray(0, 768));
    this.paletteLut = paletteBytesToRgba(this.paletteBytes);
    // Refresh existing indexed pixels? Keep RGBA as-is until next draw;
    // callers that need immediate recolour can call refreshFromIndices().
  }

  getPal(): Uint8Array {
    return new Uint8Array(this.paletteBytes);
  }

  /** Turn palette off — set to solid black (all zero, alpha opaque) */
  palOff(): void {
    this.paletteBytes.fill(0);
    for (let i = 0; i < 256; i++) this.paletteLut[i] = 0xff000000;
  }

  /**
   * Re-apply current palette LUT to all indexed pixels of a layer.
   * Useful after setPal / fade steps.
   */
  refreshLayerFromIndices(layerId: number): void {
    this.assertLayer(layerId);
    const idx = this.layerIdx[layerId];
    const u32 = this.layerU32[layerId];
    const lut = this.paletteLut;
    for (let i = 0; i < SCREEN_SIZE; i++) u32[i] = lut[idx[i]];
  }

  refreshAllFromIndices(): void {
    for (let i = 0; i < NUM_LAYERS; i++) this.refreshLayerFromIndices(i);
  }

  /**
   * Fade current palette toward a solid colour over N frames.
   * Returns a promise that resolves when done. Uses RAF timing.
   */
  async fadeTo(r: number, g: number, b: number, frames = 16): Promise<void> {
    const startPal = this.getPal();
    const targetR = r & 0xff, targetG = g & 0xff, targetB = b & 0xff;
    for (let f = 1; f <= frames; f++) {
      const t = f / frames;
      const cur = new Uint8Array(768);
      for (let i = 0; i < 256; i++) {
        const sr = startPal[i * 3], sg = startPal[i * 3 + 1], sb = startPal[i * 3 + 2];
        cur[i * 3] = (sr + (targetR - sr) * t) | 0;
        cur[i * 3 + 1] = (sg + (targetG - sg) * t) | 0;
        cur[i * 3 + 2] = (sb + (targetB - sb) * t) | 0;
      }
      this.paletteBytes.set(cur);
      this.paletteLut = paletteBytesToRgba(cur);
      this.refreshAllFromIndices();
      this.present();
      await this.nextFrame();
    }
  }

  /** Fade from black to the given palette over N frames */
  async fadeIn(targetPal: Uint8Array, frames = 16): Promise<void> {
    const len = Math.min(768, targetPal.length);
    const src = new Uint8Array(768);
    src.set(targetPal.subarray(0, len));
    // Normalise 0-63 → 0-255 if needed
    let max = 0;
    for (let i = 0; i < 768; i++) if (src[i] > max) max = src[i];
    const scaled = new Uint8Array(768);
    for (let i = 0; i < 768; i++) scaled[i] = max <= 63 ? (src[i] * 255 / 63) | 0 : src[i];

    this.palOff();
    this.refreshAllFromIndices();
    this.present();

    for (let f = 1; f <= frames; f++) {
      const t = f / frames;
      const cur = new Uint8Array(768);
      for (let i = 0; i < 768; i++) cur[i] = (scaled[i] * t) | 0;
      this.paletteBytes.set(cur);
      this.paletteLut = paletteBytesToRgba(cur);
      this.refreshAllFromIndices();
      this.present();
      await this.nextFrame();
    }
    // Ensure exact final
    this.paletteBytes.set(scaled);
    this.paletteLut = paletteBytesToRgba(scaled);
    this.refreshAllFromIndices();
    this.present();
  }

  // Backwards-compat aliases matching QB naming
  setPalWrapper = this.setPal.bind(this);
  getPalWrapper = this.getPal.bind(this);

  // -------------------------------------------------------------------------
  // Blit / RAF
  // -------------------------------------------------------------------------

  /** Copy VIDEO layer to the visible canvas */
  present(): void {
    this.ctx.putImageData(this.layers[VIDEO], 0, 0);
  }

  /** Present a specific layer directly (debug) */
  presentLayer(id: number): void {
    this.assertLayer(id);
    this.ctx.putImageData(this.layers[id], 0, 0);
  }

  /** Start 60fps RAF loop that presents VIDEO each frame */
  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.present();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  nextFrame(): Promise<void> {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  // -------------------------------------------------------------------------
  // Accessors for tests / Phase 3 blitter
  // -------------------------------------------------------------------------

  getLayerImageData(id: number): ImageData {
    this.assertLayer(id);
    return this.layers[id];
  }

  getLayerU32(id: number): Uint32Array {
    this.assertLayer(id);
    return this.layerU32[id];
  }

  getLayerIndices(id: number): Uint8Array {
    this.assertLayer(id);
    return this.layerIdx[id];
  }

  getPaletteLut(): Uint32Array {
    return new Uint32Array(this.paletteLut);
  }

  private assertLayer(id: number): void {
    if (id < 0 || id >= NUM_LAYERS) throw new Error(`Screen: invalid layer ${id}`);
  }
}
