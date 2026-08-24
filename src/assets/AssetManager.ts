export interface AssetLoader<T> {
  load(data: Uint8Array): T;
  getName(): string;
}

export class AssetManager {
  private loaders: Map<string, AssetLoader<any>> = new Map();
  private assets: Map<string, any> = new Map();

  registerLoader(extension: string, loader: AssetLoader<any>) {
    this.loaders.set(extension, loader);
  }

  async loadAsset(path: string): Promise<any> {
    if (this.assets.has(path)) {
      return this.assets.get(path);
    }

    // Vite serves `public/` at site root, so `/GFX/foo` not `/public/GFX/foo`
    const url = path.startsWith("/") ? path : `/${path}`;
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    const extension = path.split('.').pop()?.toLowerCase() || '';
    const loader = this.loaders.get(extension);

    if (!loader) {
      throw new Error(`No loader found for extension: ${extension}`);
    }

    const asset = loader.load(data);
    this.assets.set(path, asset);
    return asset;
  }

  getAsset<T>(path: string): T {
    const asset = this.assets.get(path);
    if (!asset) {
      throw new Error(`Asset not loaded: ${path}`);
    }
    return asset as T;
  }

  hasAsset(path: string): boolean {
    return this.assets.has(path);
  }
}