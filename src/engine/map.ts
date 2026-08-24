/** Phase 5 — data loading + screen preparation (engine/*) */
import type {
  TypePrefs,
  TypeTileProperties,
  TypeSpriteProperties,
  TypeTileLayers,
  TypeEnems,
  TypeHotSpots,
} from "./types";
import { cToIdx, BACK, ANIMATED } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchText(path: string): Promise<string> {
  const url = path.startsWith("/") ? path : `/${path}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetchText ${path}: ${r.status}`);
  return r.text();
}

async function fetchBytes(path: string): Promise<Uint8Array> {
  const url = path.startsWith("/") ? path : `/${path}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetchBytes ${path}: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

/** Parse ints split by comma / whitespace / newlines — mirrors QB INPUT sequential read */
function parseInts(text: string): number[] {
  const vals: number[] = [];
  // Split on commas and whitespace
  for (const tok of text.split(/[\s,]+/)) {
    if (tok.length === 0) continue;
    const n = parseInt(tok, 10);
    if (!Number.isNaN(n)) vals.push(n);
  }
  return vals;
}

// ---------------------------------------------------------------------------
// Loaders — mirroring ENGINE.BAS names (async variants for browser)
// ---------------------------------------------------------------------------

/** TILEPROP.TXT → TypeTileProperties[] ; sets prefs.numTiles */
export async function engineLoadTileProperties(
  prefs: TypePrefs,
  base: string = "",
): Promise<TypeTileProperties[]> {
  const txt = await fetchText(`${base}MAP/${prefs.tilePropertiesFile}`);
  const nums = parseInts(txt);
  const out: TypeTileProperties[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ location: nums[i], flags: nums[i + 1] });
  prefs.numTiles = out.length;
  return out;
}

/** SPRPROP.TXT → TypeSpriteProperties[] ; sets prefs.numSprites */
export async function engineLoadSpriteProperties(
  prefs: TypePrefs,
  base: string = "",
): Promise<TypeSpriteProperties[]> {
  const txt = await fetchText(`${base}GFX/${prefs.spritePropertiesFile}`);
  const nums = parseInts(txt);
  const out: TypeSpriteProperties[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ offX: nums[i], offY: nums[i + 1] });
  prefs.numSprites = out.length;
  return out;
}

/** SPRMAP.TXT → number[] (sequential ints, expected 64 entries) */
export async function engineLoadSpriteMapping(
  prefs: TypePrefs,
  base: string = "",
): Promise<number[]> {
  const txt = await fetchText(`${base}GFX/${prefs.spriteMappingFile}`);
  const nums = parseInts(txt);
  // Original REDIM spriteMapping%(63) — 64 entries; trim/pad
  const out = nums.slice(0, 64);
  while (out.length < 64) out.push(0);
  return out;
}

/** TILESET / SPRITESET — thin wrappers around PCX; return sheet for Screen.blit* */
export async function engineLoadTileset(
  prefs: TypePrefs,
  base: string = "",
): Promise<{ width: number; height: number; data: Uint8Array; palette: Uint8Array | null }> {
  const { PCXLoader } = await import("../assets/PCXLoader");
  const bytes = await fetchBytes(`${base}GFX/${prefs.tilesetFile}`);
  const img = new PCXLoader().load(bytes);
  if (img.palette) prefs.pal = img.palette;
  return { width: img.width, height: img.height, data: img.data, palette: img.palette };
}

export async function engineLoadSpriteset(
  prefs: TypePrefs,
  base: string = "",
): Promise<{ width: number; height: number; data: Uint8Array; palette: Uint8Array | null }> {
  const { PCXLoader } = await import("../assets/PCXLoader");
  const bytes = await fetchBytes(`${base}GFX/${prefs.spritesetFile}`);
  const img = new PCXLoader().load(bytes);
  // Spriteset palette typically same as tileset; keep first loaded pal if already set
  if (!prefs.pal && img.palette) prefs.pal = img.palette;
  // Original does DQBget slicing — our blitter does indexed slicing, so we keep whole sheet
  return { width: img.width, height: img.height, data: img.data, palette: img.palette };
}

/** LALA.MAP → Uint8Array (tile indices, byte per tile, 8640 bytes for 6×6×20×12) */
export async function engineMapLoad(
  prefs: TypePrefs,
  base: string = "",
): Promise<Uint8Array> {
  const bytes = await fetchBytes(`${base}MAP/${prefs.mapFile}`);
  const expected = prefs.mapW * prefs.mapH * prefs.screenW * prefs.screenH;
  if (bytes.length < expected) console.warn(`engineMapLoad: expected ${expected} bytes, got ${bytes.length}`);
  // Return raw indices (0-255)
  return bytes.slice(0, expected);
}

/** ENEMS.TXT → TypeEnems[pant][4] ; pant count = mapW*(mapH-1) (30 for 6×6) */
export async function engineLoadEnems(
  prefs: TypePrefs,
  base: string = "",
): Promise<TypeEnems[][]> {
  const txt = await fetchText(`${base}MAP/${prefs.enemsFile}`);
  const nums = parseInts(txt);
  const pants = prefs.mapW * (prefs.mapH - 1); // original maxPants+1
  const enems: TypeEnems[][] = [];
  let p = 0;
  for (let i = 0; i < pants; i++) {
    const row: TypeEnems[] = [];
    for (let j = 0; j < prefs.nEnems; j++) {
      const x  = nums[p++] ?? 0;
      const y  = nums[p++] ?? 0;
      const x1 = nums[p++] ?? 0;
      const y1 = nums[p++] ?? 0;
      const x2 = nums[p++] ?? 0;
      const y2 = nums[p++] ?? 0;
      const mx = nums[p++] ?? 0;
      const my = nums[p++] ?? 0;
      const t  = nums[p++] ?? 0;
      row.push({ x, y, x1, y1, x2, y2, mx, my, t, facing: 0, frame: 0, subFrame: 0, sprId: 0 });
    }
    enems.push(row);
  }
  return enems;
}

/** HOTSPOTS.TXT → TypeHotSpots[] length mapW*mapH (30) */
export async function engineLoadHotSpots(
  prefs: TypePrefs,
  base: string = "",
): Promise<TypeHotSpots[]> {
  const txt = await fetchText(`${base}MAP/${prefs.hotSpotsFile}`);
  const nums = parseInts(txt);
  const pants = prefs.mapW * (prefs.mapH - 1);
  const out: TypeHotSpots[] = [];
  let p = 0;
  for (let i = 0; i < pants; i++) {
    const x = nums[p++] ?? 0;
    const y = nums[p++] ?? 0;
    const t = nums[p++] ?? 0;
    const _chumi = nums[p++] ?? 0; // dummy in original
    void _chumi;
    out.push({ x, y, t, s: true });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Screen preparation — mirrors engineScreenPrepare
// ---------------------------------------------------------------------------

/**
 * Populate curScreenBuff (308 entries, letterboxed 22×14) from flat map + tileProperties.
 * Also updates prefs.hotSpotX/Y based on hotSpots[nPant].
 */
export function engineScreenPrepare(
  nPant: number,
  tileProperties: TypeTileProperties[],
  map: Uint8Array,
  curScreenBuff: TypeTileLayers[],
  prefs: TypePrefs,
  hotSpots: TypeHotSpots[],
): void {
  // Clear — caller may have passed createCurScreenBuff() fresh, but mirror ERASE+REDIM
  for (let i = 0; i < curScreenBuff.length; i++) {
    curScreenBuff[i].layer1 = 0;
    curScreenBuff[i].layer2 = 0;
    curScreenBuff[i].behaviour = 0;
    curScreenBuff[i].anim = false;
    curScreenBuff[i].realMapIndex = -1;
  }

  const xPant = nPant % prefs.mapW;
  const yPant = Math.floor(nPant / prefs.mapW);
  const mapTileWidth = prefs.mapW * prefs.screenW;

  for (let y = 0; y < prefs.screenH; y++) {
    const index = (yPant * prefs.screenH + y) * mapTileWidth + xPant * prefs.screenW;
    for (let x = 0; x < prefs.screenW; x++) {
      const iindex = cToIdx(x, y);
      const value = map[index + x] ?? 0;
      const tp = tileProperties[value] ?? { location: BACK, flags: 0 };
      if (tp.location === BACK) curScreenBuff[iindex].layer1 = value;
      else curScreenBuff[iindex].layer2 = value;
      curScreenBuff[iindex].anim = tp.location === ANIMATED;
      curScreenBuff[iindex].behaviour = tp.flags;
      curScreenBuff[iindex].realMapIndex = index + x;
    }
  }

  const hs = hotSpots[nPant];
  if (hs && hs.s) {
    prefs.hotSpotX = hs.x << 4; // DQBshiftLeft(x,4) == x*16
    prefs.hotSpotY = hs.y << 4;
  } else {
    prefs.hotSpotX = 999;
    prefs.hotSpotY = 999;
  }
}

// ---------------------------------------------------------------------------
// Rendering helpers for Phase 5 wiring (used by game-loop later, but
// provide minimal versions here to allow init validation)
// ---------------------------------------------------------------------------

export function engineScreenDrawLayer1(
  screen: import("../screen").Screen,
  tileset: { width: number; height: number; data: Uint8Array },
  prefs: TypePrefs,
  curScreenBuff: TypeTileLayers[],
  targetLayer: number,
): void {
  // Mirrors ENGINE.BAS: iterate 12×20, blit layer1 to target
  let x = 0, y = 0;
  const screenPixelW = 16 * prefs.screenW;
  let idx = 23; // skip letterbox
  for (let i = 0; i < prefs.screenH; i++) {
    for (let j = 0; j < prefs.screenW; j++) {
      const id = curScreenBuff[idx].layer1;
      if (id) screen.blitTile(targetLayer, tileset, id, prefs.screenPos.x + x, prefs.screenPos.y + y);
      x += 16;
      if (x === screenPixelW) { x = 0; y += 16; }
      idx++;
    }
    idx += 2; // border
  }
}

export function engineScreenDrawLayer2(
  screen: import("../screen").Screen,
  tileset: { width: number; height: number; data: Uint8Array },
  prefs: TypePrefs,
  curScreenBuff: TypeTileLayers[],
  frame: number,
  targetLayer: number,
): void {
  let x = 0, y = 0;
  const screenPixelW = 16 * prefs.screenW;
  let idx = 23;
  for (let i = 0; i < prefs.screenH; i++) {
    for (let j = 0; j < prefs.screenW; j++) {
      let id = curScreenBuff[idx].layer2;
      if (curScreenBuff[idx].anim) id += frame & 3;
      if (id) screen.blitTile(targetLayer, tileset, id, prefs.screenPos.x + x, prefs.screenPos.y + y);
      x += 16;
      if (x === screenPixelW) { x = 0; y += 16; }
      idx++;
    }
    idx += 2;
  }
}
