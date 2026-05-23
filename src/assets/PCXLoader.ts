import { AssetLoader } from './AssetManager';

export interface PCXImage {
  width: number;
  height: number;
  data: Uint8Array;
  palette: Uint8Array | null;
  bitsPerPixel: number;
  bytesPerLine: number;
}

export class PCXLoader implements AssetLoader<PCXImage> {
  getName(): string {
    return 'PCX';
  }

  load(data: Uint8Array): PCXImage {
    const signature = String.fromCharCode(data[0], data[1]);
    if (signature !== 'PC') {
      throw new Error('Invalid PCX file signature');
    }

    const encoding = data[2];
    const bitsPerPixel = data[3];
    const bytesPerLine = data[66] | (data[67] << 8);
    const paletteType = data[65];

    const xMin = data[4] | (data[5] << 8);
    const yMin = data[6] | (data[7] << 8);
    const xMax = data[8] | (data[9] << 8);
    const yMax = data[10] | (data[11] << 8);

    const width = xMax - xMin + 1;
    const height = yMax - yMin + 1;

    const imageData = new Uint8Array(width * height);
    let dataIndex = 128;
    let imageIndex = 0;

    while (dataIndex < data.length - 769) {
      const byte = data[dataIndex++];
      
      if (encoding === 1) {
        const count = byte & 0xC0;
        const value = byte & 0x3F;
        
        if (count !== 0) {
          const repeatCount = count >> 6;
          for (let i = 0; i < repeatCount; i++) {
            if (imageIndex < imageData.length) {
              imageData[imageIndex++] = value;
            }
          }
        } else {
          if (imageIndex < imageData.length) {
            imageData[imageIndex++] = byte;
          }
        }
      } else {
        if (imageIndex < imageData.length) {
          imageData[imageIndex++] = byte;
        }
      }
    }

    let palette: Uint8Array | null = null;
    if (paletteType === 1) {
      palette = new Uint8Array(768);
      for (let i = 0; i < 768; i++) {
        palette[i] = data[data.length - 768 + i];
      }
    }

    return {
      width,
      height,
      data: imageData,
      palette,
      bitsPerPixel,
      bytesPerLine
    };
  }
}