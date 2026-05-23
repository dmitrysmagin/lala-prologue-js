import { createAssetManager, preloadAssets, defaultAssetIndex } from './assets';

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');

async function initGame() {
  if (!ctx) {
    console.error('Failed to get 2D context');
    return;
  }

  console.log('Initializing LaLa project - Phase 1: Asset Loaders');
  
  const assetManager = createAssetManager();
  
  try {
    await preloadAssets(assetManager, defaultAssetIndex);
    
    const lalaFont = assetManager.getAsset<any>('GFX/LALA.FNT');
    console.log('Font loaded:', lalaFont);
    
    const mapData = assetManager.getAsset<any>('MAP/LALA.MAP');
    console.log('Map loaded:', mapData);
    
    const sprmapText = assetManager.getAsset<any>('GFX/SPRMAP.TXT');
    console.log('Sprite map loaded:', sprmapText);
    
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(160, 100, 2, 2);
    
    console.log('LaLa project initialized - Phase 1 complete');
  } catch (error) {
    console.error('Failed to load assets:', error);
  }
}

initGame();