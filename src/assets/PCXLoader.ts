import { AssetLoader } from './AssetManager';

export interface PCXImage {
  width: number;
  height: number;
  data: Uint8Array; // 8-bit indices, width*height
  palette: Uint8Array | null; // 768 bytes RGB 0-255, if present
  bitsPerPixel: number;
  bytesPerLine: number;
}

export class PCXLoader implements AssetLoader<PCXImage> {
  getName(): string {
    return 'PCX';
  }

  load(data: Uint8Array): PCXImage {
    if (data.length < 128) throw new Error('PCX: file too short');
    const manufacturer = data[0];
    if (manufacturer !== 0x0a) throw new Error(`Invalid PCX file signature: manufacturer ${manufacturer} != 0x0A`);
    const encoding = data[2];
    const bitsPerPixel = data[3];
    const xMin = data[4] | (data[5] << 8);
    const yMin = data[6] | (data[7] << 8);
    const xMax = data[8] | (data[9] << 8);
    const yMax = data[10] | (data[11] << 8);
    const bytesPerLine = data[66] | (data[67] << 8);

    const width = xMax - xMin + 1;
    const height = yMax - yMin + 1;
    if (width <= 0 || height <= 0) throw new Error(`PCX: invalid dimensions ${width}x${height}`);

    const imageData = new Uint8Array(width * height);

    // Determine palette region: 256-color PCX has 0x0C marker + 768 bytes at EOF
    const hasPaletteMarker = data.length >= 769 && data[data.length - 769] === 0x0c;
    const imageEnd = hasPaletteMarker ? data.length - 769 : data.length;

    // RLE decode — bytesPerLine may be > width (padding); decode scanline by scanline
    let src = 128;
    let dstOffset = 0;
    // Temporary line buffer to handle padding
    const lineBuf = new Uint8Array(bytesPerLine > 0 ? bytesPerLine : width);

    for (let y = 0; y < height; y++) {
      let linePos = 0;
      while (linePos < bytesPerLine && src < imageEnd) {
        const b = data[src++];
        let count = 1;
        let value = b;
        if (encoding === 1 && (b & 0xc0) === 0xc0) {
          count = b & 0x3f;
          if (src >= imageEnd) break;
          value = data[src++];
        }
        for (let i = 0; i < count && linePos < bytesPerLine; i++) {
          lineBuf[linePos++] = value;
        }
      }
      // Copy first `width` bytes of lineBuf into imageData
      const copy = Math.min(width, linePos);
      imageData.set(lineBuf.subarray(0, copy), dstOffset);
      dstOffset += width;
      // If line was short (corrupt), pad with 0 and continue
    }

    let palette: Uint8Array | null = null;
    if (hasPaletteMarker) {
      palette = new Uint8Array(768);
      palette.set(data.subarray(data.length - 768));
    } else if (data.length >= 768) {
      // Fallback: some files may have palette without marker; check tail not all zero
      // Only treat as palette if the last 768 bytes look like palette (not image data)
      // Here we already handled marker case, so no palette.
    }

    return {
      width,
      height,
      data: imageData,
      palette,
      bitsPerPixel,
      bytesPerLine,
    };
  }
}
