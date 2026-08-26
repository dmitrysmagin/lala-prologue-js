/**
 * Smooth scrolling data types — flat world buffer + camera.
 */

import type { TypeTileProperties, TypeHotSpots, TypeEnems, TypePrefs } from "./types";
import { BACK, ANIMATED } from "./types";

/** Flat world buffer — holds all tiles for the entire map */
export interface WorldBuff {
  /** Tile indices (background layer) — Uint8Array(mapW*screenW * mapH*screenH) */
  layer1: Uint8Array;
  /** Tile indices (foreground/animated layer) */
  layer2: Uint8Array;
  /** Tile behaviour flags (0..10) */
  behaviour: Uint8Array;
  /** True if tile is animated (cycles through frame offsets) */
  anim: Uint8Array;
  /** Back-reference to flat map byte offset */
  realMapIndex: Uint32Array;
  /** World width in tiles (mapW * screenW) */
  worldW: number;
  /** World height in tiles (mapH * screenH) */
  worldH: number;
}

/** Camera / viewport position (pixel coordinates) */
export interface Camera {
  x: number;
  y: number;
}

/** Create a blank world buffer */
export function createWorldBuff(worldW: number, worldH: number): WorldBuff {
  const size = worldW * worldH;
  return {
    layer1: new Uint8Array(size),
    layer2: new Uint8Array(size),
    behaviour: new Uint8Array(size),
    anim: new Uint8Array(size),
    realMapIndex: new Uint32Array(size),
    worldW,
    worldH,
  };
}

/**
 * Build world buffer from flat map + tile properties.
 * Iterates all screens and copies tiles into the 120×72 world grid.
 */
export function buildWorldBuff(
  map: Uint8Array,
  tileProperties: TypeTileProperties[],
  prefs: TypePrefs,
): WorldBuff {
  const worldW = prefs.mapW * prefs.screenW;  // 120
  const worldH = prefs.mapH * prefs.screenH;  //72
  const world = createWorldBuff(worldW, worldH);
  const mapTileWidth = prefs.mapW * prefs.screenW; // same as worldW

  for (let sy = 0; sy < prefs.mapH; sy++) {
    for (let sx = 0; sx < prefs.mapW; sx++) {
      const worldBaseY = sy * prefs.screenH;
      const worldBaseX = sx * prefs.screenW;

      for (let ty = 0; ty < prefs.screenH; ty++) {
        const mapRow = (sy * prefs.screenH + ty) * mapTileWidth + sx * prefs.screenW;
        const worldRow = (worldBaseY + ty) * worldW + worldBaseX;

        for (let tx = 0; tx < prefs.screenW; tx++) {
          const mapIdx = mapRow + tx;
          const worldIdx = worldRow + tx;
          const value = map[mapIdx] ?? 0;
          const tp = tileProperties[value] ?? { location: BACK, flags: 0 };

          if (tp.location === BACK) {
            world.layer1[worldIdx] = value;
          } else {
            world.layer2[worldIdx] = value;
          }
          world.anim[worldIdx] = tp.location === ANIMATED ? 1 : 0;
          world.behaviour[worldIdx] = tp.flags;
          world.realMapIndex[worldIdx] = mapIdx;
        }
      }
    }
  }

  return world;
}

/**
 * Convert per-screen enemy positions to world-absolute pixel coordinates.
 * Modifies enemies in place.
 */
export function convertEnemiesToWorld(
  enems: TypeEnems[][],
  prefs: TypePrefs,
): void {
  for (let sy = 0; sy < prefs.mapH; sy++) {
    for (let sx = 0; sx < prefs.mapW; sx++) {
      const nPant = sy * prefs.mapW + sx;
      const screen = enems[nPant];
      if (!screen) continue;
      const offsetX = sx * prefs.screenW * 16; // pixel offset
      const offsetY = sy * prefs.screenH * 16;
      for (const e of screen) {
        e.x  += offsetX;  e.y  += offsetY;
        e.x1 += offsetX;  e.y1 += offsetY;
        e.x2 += offsetX;  e.y2 += offsetY;
      }
    }
  }
}

/**
 * Convert per-screen hotspot positions to world-absolute pixel coordinates.
 * Returns a new flat array of world-absolute hotspots.
 */
export function convertHotSpotsToWorld(
  hotSpots: TypeHotSpots[],
  prefs: TypePrefs,
): TypeHotSpots[] {
  const world: TypeHotSpots[] = [];
  for (let sy = 0; sy < prefs.mapH; sy++) {
    for (let sx = 0; sx < prefs.mapW; sx++) {
      const nPant = sy * prefs.mapW + sx;
      const hs = hotSpots[nPant] ?? { x: 0, y: 0, t: 0, s: false };
      world.push({
        x: hs.x + sx * prefs.screenW,
        y: hs.y + sy * prefs.screenH,
        t: hs.t,
        s: hs.s,
      });
    }
  }
  return world;
}
