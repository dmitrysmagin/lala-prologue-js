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

  for (const e of enemies) {
    if (e.t === 0) continue;

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

    // --- Boundary bounce ---
    if (e.x === e.x1 || e.x === e.x2) e.mx = -e.mx;
    if (e.y === e.y1 || e.y === e.y2) e.my = -e.my;
  }
}
