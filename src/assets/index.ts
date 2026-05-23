export * from './AssetManager';
export * from './PCXLoader';
export * from './FNTLoader';
export * from './BMALoader';
export * from './MAPLoader';
export * from './TXTLoader';
export * from './WAVLoader';
export * from './AssetIndex';

import { AssetManager } from './AssetManager';
import { PCXLoader } from './PCXLoader';
import { FNTLoader } from './FNTLoader';
import { BMALoader } from './BMALoader';
import { MAPLoader } from './MAPLoader';
import { TXTLoader } from './TXTLoader';
import { WAVLoader } from './WAVLoader';
import { defaultAssetIndex } from './AssetIndex';

export function createAssetManager(): AssetManager {
  const manager = new AssetManager();
  
  manager.registerLoader('pcx', new PCXLoader());
  manager.registerLoader('fnt', new FNTLoader());
  manager.registerLoader('bma', new BMALoader());
  manager.registerLoader('map', new MAPLoader());
  manager.registerLoader('txt', new TXTLoader());
  manager.registerLoader('wav', new WAVLoader());
  
  return manager;
}

export async function preloadAssets(manager: AssetManager, assetIndex: typeof defaultAssetIndex): Promise<void> {
  const loadPromises: Promise<void>[] = [];

  for (const pcxPath of assetIndex.pcx) {
    loadPromises.push(manager.loadAsset(pcxPath).then(() => {
      console.log(`Loaded PCX: ${pcxPath}`);
    }));
  }

  for (const fntPath of assetIndex.fnt) {
    loadPromises.push(manager.loadAsset(fntPath).then(() => {
      console.log(`Loaded FNT: ${fntPath}`);
    }));
  }

  for (const bmaPath of assetIndex.bma) {
    loadPromises.push(manager.loadAsset(bmaPath).then(() => {
      console.log(`Loaded BMA: ${bmaPath}`);
    }));
  }

  for (const mapPath of assetIndex.map) {
    loadPromises.push(manager.loadAsset(mapPath).then(() => {
      console.log(`Loaded MAP: ${mapPath}`);
    }));
  }

  for (const txtPath of assetIndex.txt) {
    loadPromises.push(manager.loadAsset(txtPath).then(() => {
      console.log(`Loaded TXT: ${txtPath}`);
    }));
  }

  for (const wavPath of assetIndex.wav) {
    loadPromises.push(manager.loadAsset(wavPath).then(() => {
      console.log(`Loaded WAV: ${wavPath}`);
    }));
  }

  await Promise.all(loadPromises);
  console.log('All assets loaded successfully!');
}