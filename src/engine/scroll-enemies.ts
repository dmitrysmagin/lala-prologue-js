/**
 * Scroll-mode enemy AI — world-absolute positions.
 * Flat enemy array (all enemies from all screens, already world-converted).
 *
 * Movement: enemies patrol between x1/x2/y1/y2 bounds (old screen boundaries).
 * No tile collision — direction changes only at patrol limits and world edges.
 */
import { STATENORMAL, STATEFLICKER } from "./types";
import type { TypeEnems, TypePlayer, TypePrefs } from "./types";
import type { WorldBuff } from "./scroll-types";
import type { PlaySfx } from "./player";

const noopSfx: PlaySfx = () => {};

/** Look up behaviour from world buffer at tile coords */
function worldBehav(world: WorldBuff, tx: number, ty: number): number {
  if (tx < 0 || tx >= world.worldW || ty < 0 || ty >= world.worldH) return 0;
  return world.behaviour[ty * world.worldW + tx];
}

export interface EnemyCollisionDebug {
  enemyRects: { x: number; y: number }[];
  patrolRects: { x1: number; y1: number; x2: number; y2: number }[];
}

/**
 * Move all world-absolute enemies, handle platform riding and damage.
 * Enemies patrol between x1/x2/y1/y2. No tile collision.
 */
export function scrollMoveEnemies(
  enemies: TypeEnems[],
  world: WorldBuff,
  prefs: TypePrefs,
  player: TypePlayer,
  playSfx: PlaySfx = noopSfx,
  debug?: EnemyCollisionDebug,
): void {
  player.gotten = 0;

  const worldPxW = world.worldW * 16;
  const worldPxH = world.worldH * 16;
  const plPx = player.x >> 6;
  const plPy = player.y >> 6;

  for (const e of enemies) {
    if (e.t === 0) continue;

    // --- Proximity culling: skip enemies far from player ---
    const distX = e.x - plPx;
    const distY = e.y - plPy;
    if (distX > 400 || distX < -400 || distY > 400 || distY < -400) continue;

    // --- Move ---
    e.x += e.mx;
    e.y += e.my;

    // --- Platform riding (type == enemPlat) ---
    if (e.t === prefs.enemPlat) {
      const px = player.x >> 6;
      const py = player.y >> 6;

      if (e.my < 0) {
        if (px >= e.x - 15 && px <= e.x + 15 &&
            py >= e.y - 16 && py <= e.y - 9 &&
            player.vy >= -prefs.jumpIncr) {
          player.gotten = 1;
          player.y = (e.y - 16) << 6;
          player.vy = 0;
          const xx = px >> 4;
          const yy = py >> 4;
          if (worldBehav(world, xx, yy) > 7 ||
              ((px & 15) !== 0 && worldBehav(world, xx + 1, yy) > 7)) {
            player.y = (yy + 1) << 10;
          }
        }
      } else if (e.my > 0) {
        if (px >= e.x - 15 && px <= e.x + 15 &&
            py >= e.y - 20 && py <= e.y - 14 &&
            player.vy >= 0) {
          player.gotten = 1;
          player.y = (e.y - 16) << 6;
          player.vy = 0;
          const xx = px >> 4;
          const yy = py >> 4;
          if (worldBehav(world, xx, yy + 1) > 3 ||
              ((px & 15) !== 0 && worldBehav(world, xx + 1, yy + 1) > 3)) {
            player.y = yy << 10;
          }
        }
      }

      // Horizontal platform riding
      if (e.mx !== 0) {
        if (px >= e.x - 15 && px <= e.x + 15 &&
            py >= e.y - 16 && py <= e.y - 11 &&
            player.vy >= 0) {
          player.gotten = 1;
          player.y = (e.y - 16) << 6;
          const newPx = px + e.mx;
          player.x = newPx << 6;
          const xx = newPx >> 4;
          const yy = py >> 4;
          if (e.mx < 0) {
            if (worldBehav(world, xx, yy) > 7 ||
                ((py & 15) !== 0 && worldBehav(world, xx, yy + 1) > 7)) {
              player.vx = 0;
              player.x = (xx + 1) << 10;
            }
          } else if (e.mx > 0) {
            if (worldBehav(world, xx + 1, yy) > 7 ||
                ((py & 15) !== 0 && worldBehav(world, xx + 1, yy + 1) > 7)) {
              player.vx = 0;
              player.x = xx << 10;
            }
          }
        }
      }
    } else {
      // --- Damage collision (AABB ±14 px) ---
      if (player.state === STATENORMAL) {
        const px = player.x >> 6;
        const py = player.y >> 6;
        if (e.x >= px - 14 && e.x <= px + 14 && e.y >= py - 14 && e.y <= py + 14) {
          player.state = STATEFLICKER;
          player.ctState = 128;
          if (e.mx > 0) player.vx = prefs.walkVxMax << 1;
          else player.vx = -(prefs.walkVxMax << 1);
          if (e.my > 0) player.vy = prefs.walkVxMax << 1;
          else player.vy = -(prefs.walkVxMax << 1);
          player.lives -= 1;
          playSfx(2);
          playSfx(8, false, 11025 + ((Math.random() * 1024) | 0));
        }
      }
    }

    // --- Boundary bounce (flip-screen uses exact equality) ---
    if (e.x === e.x1 || e.x === e.x2) e.mx = -e.mx;
    if (e.y === e.y1 || e.y === e.y2) e.my = -e.my;

    // --- World-edge safety clamp ---
    if (e.x < 0) { e.x = 0; e.mx = Math.abs(e.mx); }
    else if (e.x > worldPxW - 16) { e.x = worldPxW - 16; e.mx = -Math.abs(e.mx); }
    if (e.y < 0) { e.y = 0; e.my = Math.abs(e.my); }
    else if (e.y > worldPxH - 16) { e.y = worldPxH - 16; e.my = -Math.abs(e.my); }

    // --- Record final position for debug ---
    debug?.enemyRects.push({ x: e.x, y: e.y });
    debug?.patrolRects.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2 });
  }
}
