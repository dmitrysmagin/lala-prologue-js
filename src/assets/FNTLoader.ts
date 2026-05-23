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
  palette: Uint8Array | null;
}

export class FNTLoader implements AssetLoader<FontData> {
  getName(): string {
    return 'FNT';
  }

  load(data: Uint8Array): FontData {
    const signature = String.fromCharCode(data[0], data[1], data[2], data[3]);
    if (signature !== 'FNT ') {
      throw new Error('Invalid FNT file signature');
    }

    const charWidth = data[5];
    const charHeight = data[6];
    const charCount = data[7] | (data[8] << 8);

    const chars = new Map<number, FontChar>();
    let offset = 16;

    for (let i = 0; i < charCount; i++) {
      const charCode = data[offset] | (data[offset + 1] << 8);
      const charWidth = data[offset + 2];
      const charHeight = data[offset + 3];
      const dataOffset = data[offset + 4] | (data[offset + 5] << 8) | (data[offset + 6] << 16) | (data[offset + 7] << 24);

      offset += 8;

      const charData = new Uint8Array(charWidth * charHeight);
      let dataIndex = 0;

      for (let y = 0; y < charHeight; y++) {
        for (let x = 0; x < charWidth; x++) {
          if (dataOffset + y * charWidth + x < data.length) {
            charData[dataIndex++] = data[dataOffset + y * charWidth + x];
          }
        }
      }

      chars.set(charCode, {
        width: charWidth,
        height: charHeight,
        data: charData
      });
    }

    let palette: Uint8Array | null = null;
    if (data.length > offset) {
      palette = new Uint8Array(256);
      for (let i = 0; i < 256 && offset + i < data.length; i++) {
        palette[i] = data[offset + i];
      }
    }

    return {
      charWidth,
      charHeight,
      chars,
      palette
    };
  }
}