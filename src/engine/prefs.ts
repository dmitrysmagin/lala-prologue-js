/** Phase 5 — prefs / engineInitVals */
import type { TypePrefs, TypePlayer } from "./types";
import { STATENORMAL } from "./types";

/**
 * Mirrors ENGINE.BAS:engineInitVals — prefsStore(2) with prefsStore(0) populated.
 * Updated per porting plan: bgM is now .OGG (converted via adplay → wav → ogg).
 */
export function engineInitVals(): TypePrefs[] {
  const prefsStore: TypePrefs[] = [];

  const p0: TypePrefs = {
    mapFile: "LALA.MAP",
    tilesetFile: "TILESET.PCX",
    tilePropertiesFile: "TILEPROP.TXT",
    backdropFile: "BACKDROP.PCX",
    spritesetFile: "SPRSET.PCX",
    spritePropertiesFile: "SPRPROP.TXT",
    spriteMappingFile: "SPRMAP.TXT",
    enemsFile: "ENEMS.TXT",
    hotSpotsFile: "HOTSPOTS.TXT",
    mapW: 6,
    mapH: 6,
    screenW: 20,
    screenH: 12,
    screenPos: { x: 0, y: 4 },
    numTiles: 0,   // filled after engineLoadTileProperties
    numSprites: 0, // filled after engineLoadSpriteProperties
    pal: null,
    gMaxVy: 192,
    g: 12,
    jumpVyInitial: 32,
    jumpVyMax: 192,
    jumpIncr: 24,
    walkVxMax: 128,
    walkAx: 16,
    walkFr: 24,
    iniPant: 24,
    iniTX: 2,
    iniTY: 1,
    nEnems: 4,
    totalEnems: 0,
    enemPlat: 4,
    boltTile: 22,
    lifeTile: 34,
    objectTile: 35,
    keyTile: 36,
    initialLives: 15,
    maxObjs: 15,
    refill: 1,
    hotSpotX: 999,
    hotSpotY: 999,
    bgM: "DESORUIN.OGG",
    bgL1: 9,
    bgL2: 10,
  };

  const p1: TypePrefs = { ...p0, bgM: "" }; // placeholder second entry (unused, mirrors REDIM 2)
  prefsStore.push(p0, p1);
  return prefsStore;
}

/** Mirrors engineLoadPrefs(id, prefs, prefsStore) — returns copy */
export function engineLoadPrefs(id: number, prefsStore: TypePrefs[]): TypePrefs {
  const src = prefsStore[id];
  if (!src) throw new Error(`engineLoadPrefs: invalid id ${id}`);
  return { ...src, screenPos: { ...src.screenPos } };
}

/** Convenience: default prefs (id 0) */
export function createDefaultPrefs(): TypePrefs {
  return engineLoadPrefs(0, engineInitVals());
}

/** Mirrors engineInitPlayer */
export function engineInitPlayer(player: TypePlayer, prefs: TypePrefs): void {
  player.x = prefs.iniTX * 16 * 64;
  player.y = prefs.iniTY * 16 * 64;
  player.vx = 0;
  player.vy = 0;
  player.frame = 0;
  player.facing = 0;
  player.subFrame = 0;
  player.sprId = 0;
  player.jumping = 0;
  player.gotten = 0;
  player.ctJump = 0;
  player.state = STATENORMAL;
  // keep lives/keys/objects outside — caller resets as needed
  player.objects = 0;
  player.attempt = 0;
  player.ctState = 0;
  player.gameOver = 0;
}

/** Factory for fresh player with prefs defaults */
export function createPlayer(prefs: TypePrefs): TypePlayer {
  const pl: TypePlayer = {
    x: 0, y: 0, vx: 0, vy: 0,
    frame: 0, facing: 0, subFrame: 0, sprId: 0,
    gotten: 0, jumping: 0, ctJump: 0,
    lives: prefs.initialLives,
    objects: 0, score: 0, keys: 0,
    attempt: 0, state: STATENORMAL, ctState: 0, gameOver: 0,
  };
  engineInitPlayer(pl, prefs);
  return pl;
}

/** Mirrors engineInitGame — reset keys/lives */
export function engineInitGame(prefs: TypePrefs, player: TypePlayer): void {
  player.keys = 0;
  player.lives = prefs.initialLives;
}
