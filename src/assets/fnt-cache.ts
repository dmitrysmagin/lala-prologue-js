/**
 * Shared FNT font cache — fetches GFX/LALA.FNT once, parses via FNTLoader,
 * and exposes a singleton for engineRprint + title screen rendering.
 */
import { FNTLoader, type FontData } from "./FNTLoader";

let _cached: FontData | null = null;
let _loading: Promise<FontData> | null = null;

export async function loadGameFont(path = "/GFX/lala.fnt"): Promise<FontData> {
  if (_cached) return _cached;
  if (_loading) return _loading;
  _loading = (async () => {
    const r = await fetch(path);
    if (!r.ok) throw new Error(`Failed to load font: ${path} HTTP ${r.status}`);
    const buf = new Uint8Array(await r.arrayBuffer());
    console.log(`[fnt-cache] loaded ${path}: ${buf.length} bytes`);
    _cached = new FNTLoader().load(buf);
    console.log(`[fnt-cache] parsed ${_cached.chars.size} glyphs, charWidth=${_cached.charWidth}`);
    return _cached!;
  })();
  return _loading;
}

export function getCachedFont(): FontData | null {
  return _cached;
}
