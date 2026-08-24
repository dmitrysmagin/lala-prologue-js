/** Phase 5 — QB TYPE → TS interfaces */

// QB constants from ENGINE.BI
export const MAXPREFS = 1;
export const FRONT = 1;
export const BACK = 0;
export const ANIMATED = 2;

export const DLEFT = 1;
export const DRIGHT = 2;
export const DUP = 3;
export const DDOWN = 4;

export const STATENORMAL = 0;
export const STATEFLICKER = 1;

export interface Coordinates {
  x: number;
  y: number;
}

export interface TypePlayer {
  x: number;      // fixed 1/64 px
  y: number;
  vx: number;
  vy: number;
  frame: number;
  facing: number;   // 0 = right, 6 = left (matching spriteMapping offset)
  subFrame: number;
  sprId: number;
  gotten: number;   // on platform flag (0/1)
  jumping: number;  // 0/ -1
  ctJump: number;
  lives: number;
  objects: number;
  score: number;
  keys: number;
  attempt: number;  // DLEFT/DRIGHT/DUP/DDOWN or 0
  state: number;    // STATENORMAL / STATEFLICKER
  ctState: number;
  gameOver: number;
}

export interface TypePrefs {
  mapFile: string;
  tilesetFile: string;
  backdropFile: string;
  tilePropertiesFile: string;
  spritePropertiesFile: string;
  spritesetFile: string;
  spriteMappingFile: string;
  enemsFile: string;
  hotSpotsFile: string;
  mapW: number;
  mapH: number;
  screenW: number;
  screenH: number;
  screenPos: Coordinates;
  numTiles: number;
  numSprites: number;
  pal: Uint8Array | null; // 768 bytes, null until tileset load
  gMaxVy: number;
  g: number;
  jumpVyInitial: number;
  jumpVyMax: number;
  jumpIncr: number;
  walkVxMax: number;
  walkAx: number;
  walkFr: number;
  iniPant: number;
  iniTX: number;
  iniTY: number;
  nEnems: number;
  totalEnems: number;
  enemPlat: number;
  boltTile: number;
  lifeTile: number;
  objectTile: number;
  keyTile: number;
  initialLives: number;
  maxObjs: number;
  refill: number;
  hotSpotX: number;
  hotSpotY: number;
  bgM: string; // now .OGG per updated plan
  bgL1: number;
  bgL2: number;
}

export interface TypeTileProperties {
  location: number; // BACK / FRONT / ANIMATED
  flags: number;    // behaviour (0..10)
}

export interface TypeTileLayers {
  layer1: number;
  layer2: number;
  behaviour: number;
  anim: boolean;
  realMapIndex: number;
}

export interface TypeSpriteProperties {
  offX: number;
  offY: number;
}

export interface TypeHotSpots {
  x: number;
  y: number;
  t: number; // 0 none, 1 object, 2 key, 3 life
  s: boolean;
}

export interface TypeEnems {
  x: number; y: number;
  x1: number; y1: number;
  x2: number; y2: number;
  mx: number; my: number;
  t: number;
  facing: number;
  frame: number;
  subFrame: number;
  sprId: number;
}

/** Letterboxed buffer: 22×14 = 308, visible 20×12 */
export const CUR_SCREEN_BUFF_W = 22;
export const CUR_SCREEN_BUFF_H = 14;
export const CUR_SCREEN_BUFF_SIZE = CUR_SCREEN_BUFF_W * CUR_SCREEN_BUFF_H; // 308

/** cToIdx — optimized as in ENGINE.BAS */
export function cToIdx(x: number, y: number): number {
  const yy = 1 + y;
  // (yy <<4) + (yy<<2) + (yy<<1) == yy*22
  return 1 + x + (yy << 4) + (yy << 2) + (yy << 1);
  // equivalent to 1 + x + (y+1)*22
}

/** Create a blank tile-layers buffer (308 entries) */
export function createCurScreenBuff(): TypeTileLayers[] {
  return Array.from({ length: CUR_SCREEN_BUFF_SIZE }, () => ({
    layer1: 0, layer2: 0, behaviour: 0, anim: false, realMapIndex: -1,
  }));
}
