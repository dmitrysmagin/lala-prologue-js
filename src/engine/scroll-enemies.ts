/**
 * Scroll-mode enemy AI — world-absolute positions, WorldBuff tile collision.
 * Flat enemy array (all enemies from all screens, already world-converted).
 */
import { STATENORMAL, STATEFLICKER } from "./types";
import type { TypeEnems, TypePlayer, TypePrefs } from "./types";
import type { WorldBuff } from "./scroll-types";
import type { PlaySfx } from "./player";

const noopSfx: PlaySfx = () => {};

/** Look up behaviour from world buffer at pixel coords */
function worldBehavAt(world: WorldBuff, px: number, py: number): number {
  const tx = px >> 4;
  const ty = py >> 4;
  if (tx < 0 || tx >= world.worldW || ty < 0 || ty >= world.worldH) return 0;
  return world.behaviour[ty * world.worldW + tx];
}

/** Check if a tile is solid for enemy movement (behaviour > 7 = wall) */
function isWall(world: WorldBuff, px: number, py: number): boolean {
  return worldBehavAt(world, px, py) > 7;
}

/** Check if a tile is solid for floor/ceiling (behaviour > 3) */
function isSolid(world: WorldBuff, px: number, py: number): boolean {
  return worldBehavAt(world, px, py) > 3;
}

/**
 * Move all world-absolute enemies, handle platform riding and damage.
 * @param enemies — flat array of all enemies (already world-converted)
 * @param world — world tile buffer for collision
 */
export function scrollMoveEnemies(
  enemies: TypeEnems[],
  world: WorldBuff,
  prefs: TypePrefs,
  player: TypePlayer,
  playSfx: PlaySfx = noopSfx,
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

    // --- Wall collision (non-platform enemies) ---
    if (e.t !== prefs.enemPlat) {
      // Horizontal wall check — reverse only, patrol bounds handle positioning
      if (e.mx !== 0) {
        const aheadX = e.mx > 0 ? (e.x + 15) : (e.x - 1);
        if (isWall(world, aheadX, e.y) ||
            ((e.y & 15) !== 0 && isWall(world, aheadX, e.y + 15))) {
          e.mx = -e.mx;
        }
      }
      // Vertical wall check — reverse only
      if (e.my !== 0) {
        const aheadY = e.my > 0 ? (e.y + 15) : (e.y - 1);
        if (isSolid(world, e.x, aheadY) ||
            ((e.x & 15) !== 0 && isSolid(world, e.x + 15, aheadY))) {
          e.my = -e.my;
        }
      }
    }

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
          if (worldBehavAt(world, xx << 4, yy << 4) > 7 ||
              ((px & 15) !== 0 && worldBehavAt(world, (xx + 1) << 4, yy << 4) > 7)) {
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
          if (worldBehavAt(world, xx << 4, (yy + 1) << 4) > 3 ||
              ((px & 15) !== 0 && worldBehavAt(world, (xx + 1) << 4, (yy + 1) << 4) > 3)) {
            player.y = yy << 10;
          }
        }
      }

      // Horizontal platform
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
            if (worldBehavAt(world, xx << 4, yy << 4) > 7 ||
                ((py & 15) !== 0 && worldBehavAt(world, xx << 4, (yy + 1) << 4) > 7)) {
              player.vx = 0;
              player.x = (xx + 1) << 10;
            }
          } else if (e.mx > 0) {
            if (worldBehavAt(world, (xx + 1) << 4, yy << 4) > 7 ||
                ((py & 15) !== 0 && worldBehavAt(world, (xx + 1) << 4, (yy + 1) << 4) > 7)) {
              player.vx = 0;
              player.x = xx << 10;
            }
          }
        }
      }

      // Platform wall collision
      if (e.mx !== 0) {
        const aheadX = e.mx > 0 ? (e.x + 15) : (e.x - 1);
        if (isWall(world, aheadX, e.y) ||
            ((e.y & 15) !== 0 && isWall(world, aheadX, e.y + 15))) {
          e.mx = -e.mx;
        }
      }
      if (e.my !== 0) {
        const aheadY = e.my > 0 ? (e.y + 15) : (e.y - 1);
        if (isSolid(world, e.x, aheadY) ||
            ((e.x & 15) !== 0 && isSolid(world, e.x + 15, aheadY))) {
          e.my = -e.my;
        }
      }
    } else {
      // --- Damage collision (AABB ±14 px) ---
      if (player.state !== STATENORMAL) continue;
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

    // --- Patrol boundary bounce (old screen boundaries) ---
    if (e.x <= e.x1) { e.x = e.x1; e.mx = Math.abs(e.mx); }
    else if (e.x >= e.x2) { e.x = e.x2; e.mx = -Math.abs(e.mx); }
    if (e.y <= e.y1) { e.y = e.y1; e.my = Math.abs(e.my); }
    else if (e.y >= e.y2) { e.y = e.y2; e.my = -Math.abs(e.my); }

    // --- World-edge safety clamp ---
    if (e.x < 0) { e.x = 0; e.mx = Math.abs(e.mx); }
    else if (e.x > worldPxW - 16) { e.x = worldPxW - 16; e.mx = -Math.abs(e.mx); }
    if (e.y < 0) { e.y = 0; e.my = Math.abs(e.my); }
    else if (e.y > worldPxH - 16) { e.y = worldPxH - 16; e.my = -Math.abs(e.my); }
  }
}
