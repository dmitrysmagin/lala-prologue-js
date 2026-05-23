import { AssetLoader } from './AssetManager';

export interface BlenderMap {
  version: number;
  tileCount: number;
  tiles: Uint8Array;
  properties: Map<string, any>;
}

export class BMALoader implements AssetLoader<BlenderMap> {
  getName(): string {
    return 'BMA';
  }

  load(data: Uint8Array): BlenderMap {
    const signature = String.fromCharCode(data[0], data[1], data[2], data[3]);
    if (signature !== 'BMA ') {
      throw new Error('Invalid BMA file signature');
    }

    const version = data[4] | (data[5] << 8);
    const tileCount = data[6] | (data[7] << 8) | (data[8] << 16) | (data[9] << 24);

    const tiles = new Uint8Array(tileCount * 2);
    for (let i = 0; i < tileCount * 2; i++) {
      tiles[i] = data[16 + i];
    }

    const properties = new Map<string, any>();
    let offset = 16 + tileCount * 2;

    while (offset < data.length) {
      const propType = data[offset++];
      if (propType === 0) break;

      const propNameLength = data[offset++];
      const propNameBytes = [];
      for (let i = 0; i < propNameLength; i++) {
        propNameBytes.push(data[offset++]);
      }
      const propName = String.fromCharCode.apply(null, propNameBytes);

      let propValue: any;
        if (propType === 1) {
          propValue = data[offset++];
        } else if (propType === 2) {
          propValue = data[offset] | (data[offset + 1] << 8);
          offset += 2;
        } else if (propType === 3) {
          propValue = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
          offset += 4;
        } else if (propType === 4) {
          const strLength = data[offset++];
          const strBytes = [];
          for (let i = 0; i < strLength; i++) {
            strBytes.push(data[offset++]);
          }
          propValue = String.fromCharCode.apply(null, strBytes);
        } else {
          throw new Error(`Unknown property type: ${propType}`);
        }

      properties.set(propName, propValue);
    }

    return {
      version,
      tileCount,
      tiles,
      properties
    };
  }
}