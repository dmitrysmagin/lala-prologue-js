import { AssetLoader } from './AssetManager';

export interface FontChar {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface FontData {
  charWidth: number;
  charHeight: number;
  chars: Map<number, FontChar>;
  charWidths: Uint8Array;
  palette: Uint8Array | null;
}

/**
 * Loads DirectQB .FNT files.
 * Format (from FONT.ASM DQBloadFont):
 *   Offset 0:    2048 bytes — glyph bitmap (256 chars × 8 bytes, 8×8 rows)
 *   Offset 2048: 257 bytes  — CharLen table (1 byte width per char + 1 extra)
 *   Total: 2305 bytes
 * No signature header.
 */
export class FNTLoader implements AssetLoader<FontData> {
  getName(): string {
    return 'FNT';
  }

  load(data: Uint8Array): FontData {
    const GLYPH_SIZE = 2048;
    const WIDTH_SIZE = 257;
    const EXPECTED = GLYPH_SIZE + WIDTH_SIZE; // 2305

    if (data.length < EXPECTED) {
      throw new Error(`FNT: expected ${EXPECTED} bytes, got ${data.length}`);
    }

    const charWidth = 8;
    const charHeight = 8;
    const chars = new Map<number, FontChar>();

    // Read 256 character bitmaps (8 bytes each)
    for (let i = 0; i < 256; i++) {
      const offset = i * 8;
      const glyphData = data.slice(offset, offset + 8);

      // Calculate actual width from bitmap (rightmost non-zero column + 1)
      let width = charWidth;
      for (let col = charWidth - 1; col >= 0; col--) {
        let hasPixel = false;
        for (let row = 0; row < charHeight; row++) {
          if (glyphData[row] & (1 << (7 - col))) {
            hasPixel = true;
            break;
          }
        }
        if (hasPixel) { width = col + 1; break; }
        if (col === 0) width = 0; // fully empty glyph
      }
      // Use stored width if available, else bitmap-derived
      const storedWidth = data[GLYPH_SIZE + i] || width;

      chars.set(i, {
        width: storedWidth || charWidth,
        height: charHeight,
        data: glyphData,
      });
    }

    // Widths table
    const charWidths = data.slice(GLYPH_SIZE, GLYPH_SIZE + 256);

    return {
      charWidth,
      charHeight,
      chars,
      charWidths,
      palette: null,
    };
  }
}
