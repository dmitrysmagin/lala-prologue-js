/**
 * Phase 9 — Enemy AI + collision (ported from ENGINE.BAS:455-553)
 * engineMoveEnems: movement, platform riding, damage collision, boundary bounce.
 */
import { STATEFLICKER } from "./types";
import type { TypeEnems, TypePlayer, TypePrefs, TypeTileLayers } from "./types";
import { cToIdx } from "./types";
import { engineDetectCollision } from "./collision";
import type { PlaySfx } from "./player";

const noopSfx: PlaySfx = () => {};

/**
 * ENGINE.BAS:455 — move all enemies on screen nPant, handle platform riding
 * and damage collision with the player.
 *
 * Must be called once per game-logic tick (same cadence as engineMovePlayer).
 */
export function engineMoveEnems(
  enems: TypeEnems[][],
  curScreenBuff: TypeTileLayers[],
  prefs: TypePrefs,
  player: TypePlayer,
  nPant: number,
  playSfx: PlaySfx = noopSfx,
): void {
  player.gotten = 0;

  for (let i = 0; i < prefs.nEnems; i++) {
    const e = enems[nPant]?.[i];
    if (!e || e.t === 0) continue;

    // --- Move ---
    e.x += e.mx;
    e.y += e.my;

    // --- Platform riding (type == enemPlat) ---
    if (e.t === prefs.enemPlat) {
      const px = player.x >> 6;
      const py = player.y >> 6;

      if (e.my < 0) {
        // Platform moving up
        if (px >= e.x - 15 && px <= e.x + 15 &&
            py >= e.y - 16 && py <= e.y - 9 &&
            player.vy >= -prefs.jumpIncr) {
          player.gotten = 1;
          player.y = (e.y - 16) << 6;
          player.vy = 0;
          const xx = px >> 4;
          const yy = py >> 4;
          if (curScreenBuff[cToIdx(xx, yy)].behaviour > 7 ||
              ((px & 15) !== 0 && curScreenBuff[cToIdx(xx + 1, yy)].behaviour > 7)) {
            player.y = (yy + 1) << 10;
          }
        }
      } else if (e.my > 0) {
        // Platform moving down
        if (px >= e.x - 15 && px <= e.x + 15 &&
            py >= e.y - 20 && py <= e.y - 14 &&
            player.vy >= 0) {
          player.gotten = 1;
          player.y = (e.y - 16) << 6;
          player.vy = 0;
          const xx = px >> 4;
          const yy = py >> 4;
          if (curScreenBuff[cToIdx(xx, yy + 1)].behaviour > 3 ||
              ((px & 15) !== 0 && curScreenBuff[cToIdx(xx + 1, yy + 1)].behaviour > 3)) {
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
            if (curScreenBuff[cToIdx(xx, yy)].behaviour > 7 ||
                ((py & 15) !== 0 && curScreenBuff[cToIdx(xx, yy + 1)].behaviour > 7)) {
              player.vx = 0;
              player.x = (xx + 1) << 10;
            }
          } else if (e.mx > 0) {
            if (curScreenBuff[cToIdx(xx + 1, yy)].behaviour > 7 ||
                ((py & 15) !== 0 && curScreenBuff[cToIdx(xx + 1, yy + 1)].behaviour > 7)) {
              player.vx = 0;
              player.x = xx << 10;
            }
          }
        }
      }
    } else {
      // --- Damage collision (non-platform enemies) ---
      if (engineDetectCollision(i, nPant, enems, player)) {
        player.state = STATEFLICKER;
        player.ctState = 128;
        // Knockback — away from enemy, double walkVxMax
        if (e.mx > 0) player.vx = prefs.walkVxMax << 1;
        else player.vx = -(prefs.walkVxMax << 1);
        if (e.my > 0) player.vy = prefs.walkVxMax << 1;
        else player.vy = -(prefs.walkVxMax << 1);
        player.lives -= 1;
        // SFX: HIT (slot 2) + AH (slot 8)
        playSfx(2);
        playSfx(8, false, 11025 + ((Math.random() * 1024) | 0));
      }
    }

    // --- Boundary bounce ---
    if (e.x === e.x1 || e.x === e.x2) e.mx = -e.mx;
    if (e.y === e.y1 || e.y === e.y2) e.my = -e.my;
  }
}
