import { AssetLoader } from './AssetManager';

export interface MapHeader {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
}

export interface MapLayer {
  id: number;
  name: string;
  width: number;
  height: number;
  data: Uint16Array;
}

export interface MapData {
  header: MapHeader;
  layers: MapLayer[];
  tilesets: string[];
  properties: Map<string, any>;
}

export class MAPLoader implements AssetLoader<MapData> {
  getName(): string {
    return 'MAP';
  }

  load(data: Uint8Array): MapData {
    const signature = String.fromCharCode(data[0], data[1], data[2], data[3]);
    if (signature !== 'LALA') {
      throw new Error('Invalid MAP file signature');
    }

    const width = data[6] | (data[7] << 8);
    const height = data[8] | (data[9] << 8);
    const tileWidth = data[10];
    const tileHeight = data[11];
    const layerCount = data[12] | (data[13] << 8);

    const layers: MapLayer[] = [];
    let offset = 16;

    for (let i = 0; i < layerCount; i++) {
      const layerId = data[offset++];
      const layerNameLength = data[offset++];
      const layerNameBytes = [];
      for (let i = 0; i < layerNameLength; i++) {
        layerNameBytes.push(data[offset++]);
      }
      const layerName = String.fromCharCode.apply(null, layerNameBytes);

      const layerWidth = data[offset] | (data[offset + 1] << 8);
      const layerHeight = data[offset + 2] | (data[offset + 3] << 8);
      offset += 4;

      const tileCount = layerWidth * layerHeight;
      const layerData = new Uint16Array(tileCount);

      for (let j = 0; j < tileCount; j++) {
        layerData[j] = data[offset] | (data[offset + 1] << 8);
        offset += 2;
      }

      layers.push({
        id: layerId,
        name: layerName,
        width: layerWidth,
        height: layerHeight,
        data: layerData
      });
    }

    const tilesetCount = data[offset] | (data[offset + 1] << 8);
    offset += 2;
    const tilesets: string[] = [];

    for (let i = 0; i < tilesetCount; i++) {
      const tilesetLength = data[offset++];
      const tilesetBytes = [];
      for (let j = 0; j < tilesetLength; j++) {
        tilesetBytes.push(data[offset++]);
      }
      const tileset = String.fromCharCode.apply(null, tilesetBytes);
      tilesets.push(tileset);
    }

    const properties = new Map<string, any>();
    while (offset < data.length) {
      const keyLength = data[offset++];
      if (keyLength === 0) break;

      const keyBytes = [];
      for (let i = 0; i < keyLength; i++) {
        keyBytes.push(data[offset++]);
      }
      const key = String.fromCharCode.apply(null, keyBytes);

      const valueLength = data[offset++];
      const valueBytes = [];
      for (let i = 0; i < valueLength; i++) {
        valueBytes.push(data[offset++]);
      }
      const value = String.fromCharCode.apply(null, valueBytes);

      properties.set(key, value);
    }

    return {
      header: {
        width,
        height,
        tileWidth,
        tileHeight
      },
      layers,
      tilesets,
      properties
    };
  }
}