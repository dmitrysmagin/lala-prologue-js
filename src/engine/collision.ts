/**
 * Phase 9 — Collision detection (ported from ENGINE.BAS:56-72)
 * engineDetectCollision, engineDetectKeyHole
 */
import { STATENORMAL } from "./types";
import type { TypeEnems, TypePlayer, TypeTileLayers } from "./types";
import { cToIdx } from "./types";

/**
 * ENGINE.BAS:56 — bounding-box check: ±14 px on both axes.
 * Returns true if enemy i on screen nPant collides with player.
 */
export function engineDetectCollision(
  i: number,
  nPant: number,
  enems: TypeEnems[][],
  player: TypePlayer,
): boolean {
  if (player.state !== STATENORMAL) return false;
  const px = player.x >> 6;
  const py = player.y >> 6;
  const e = enems[nPant]?.[i];
  if (!e) return false;
  return (
    e.x >= px - 14 && e.x <= px + 14 &&
    e.y >= py - 14 && e.y <= py + 14
  );
}

/**
 * ENGINE.BAS:62 — detect and clear a keyhole tile at (xx, yy).
 * Returns true if a keyhole was found and removed.
 */
export function engineDetectKeyHole(
  curScreenBuff: TypeTileLayers[],
  map: Uint8Array,
  xx: number,
  yy: number,
): boolean {
  const idx = cToIdx(xx, yy);
  if (curScreenBuff[idx].behaviour === 10) {
    curScreenBuff[idx].layer1 = 0;
    curScreenBuff[idx].layer2 = 0;
    curScreenBuff[idx].behaviour = 0;
    map[curScreenBuff[idx].realMapIndex] = 0;
    return true;
  }
  return false;
}
