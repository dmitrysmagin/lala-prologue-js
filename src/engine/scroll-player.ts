/**
 * Scroll-mode player physics — world-bound, no screen transitions.
 * Wraps engineMovePlayer logic but uses WorldBuff for tile collision
 * and clamps to world bounds instead of setting player.attempt.
 */
import { Keyboard, SC_LEFT, SC_RIGHT, SC_UP, SC_CTRL } from "../keyboard";
import { STATENORMAL, STATEFLICKER } from "./types";
import type { TypePlayer, TypePrefs } from "./types";
import type { WorldBuff } from "./scroll-types";
import type { PlaySfx } from "./player";

const noopSfx: PlaySfx = () => {};

/** Look up behaviour from world buffer at tile coords */
function worldBehav(world: WorldBuff, tx: number, ty: number): number {
  if (tx < 0 || tx >= world.worldW || ty < 0 || ty >= world.worldH) return 0;
  return world.behaviour[ty * world.worldW + tx];
}

/** Clear a keyhole tile in world buffer + flat map */
function worldClearKeyHole(world: WorldBuff, map: Uint8Array, tx: number, ty: number): boolean {
  if (tx < 0 || tx >= world.worldW || ty < 0 || ty >= world.worldH) return false;
  const wIdx = ty * world.worldW + tx;
  if (world.behaviour[wIdx] !== 10) return false;
  world.layer1[wIdx] = 0;
  world.layer2[wIdx] = 0;
  world.behaviour[wIdx] = 0;
  map[world.realMapIndex[wIdx]] = 0;
  return true;
}

/**
 * Scroll-mode player physics — same mechanics as engineMovePlayer but:
 * - Edge detection: clamp to world bounds (no attempt/DLEFT/etc)
 * - Tile collision: reads world.behaviour[] instead of curScreenBuff[cToIdx()]
 * - No keyhole unlocking (future: world-based key system)
 */
export function scrollMovePlayer(
  keyboard: Keyboard,
  world: WorldBuff,
  player: TypePlayer,
  prefs: TypePrefs,
  map: Uint8Array,
  playSfx: PlaySfx = noopSfx,
): void {
  // No attempt — scroll engine has no screen transitions
  player.attempt = 0;

  // --- Flicker state ---
  if (player.state === STATEFLICKER) {
    player.ctState--;
    if (player.ctState === 0) player.state = STATENORMAL;
  }

  // ==========================
  // VERTICAL MOVEMENT (gravity)
  // ==========================
  player.vy += prefs.g;
  if (player.vy > prefs.gMaxVy) player.vy = prefs.gMaxVy;
  player.y += player.vy;

  // World bounds (vertical)
  if (player.y < 0) player.y = 0;
  const maxY = (world.worldH * 16 - 16) << 6; // 1 tile from bottom
  if (player.y > maxY) player.y = maxY;

  if (player.gotten) player.vy = 0;

  // Tile coords
  let y = player.y >> 6;
  let yy = y >> 4;
  let x = player.x >> 6;
  let xx = x >> 4;

  // --- Vertical tile collision ---
  if (player.vy < 0) {
    const b1 = worldBehav(world, xx, yy);
    const b2 = (x & 15) !== 0 ? worldBehav(world, xx + 1, yy) : 0;
    if (b1 > 7 || b2 > 7) {
      player.vy += prefs.jumpIncr >> 1;
      player.y = (yy + 1) << 10;
      y = player.y >> 6;
      yy = y >> 4;
    }
  } else if (player.vy > 0 && (y & 15) <= (prefs.gMaxVy >> 6)) {
    const b1 = worldBehav(world, xx, yy + 1);
    const b2 = (x & 15) !== 0 ? worldBehav(world, xx + 1, yy + 1) : 0;
    if (b1 > 3 || b2 > 3) {
      player.vy = 0;
      player.y = yy << 10;
      y = player.y >> 6;
      yy = y >> 4;
    }
  }

  // ==========================
  // JUMPING
  // ==========================
  if (keyboard.isDown(SC_CTRL) || keyboard.isDown(SC_UP)) {
    if (player.vy === 0 && !player.jumping) {
      const onGround =
        player.gotten ||
        worldBehav(world, xx, yy + 1) > 3 ||
        ((x & 15) !== 0 && worldBehav(world, xx + 1, yy + 1) > 3);
      if (onGround) {
        player.jumping = -1;
        player.ctJump = 0;
        playSfx(3, false, 11025 + ((Math.random() * 1024) | 0));
        player.x = x << 6;
      }
    }
    if (player.jumping) {
      player.vy -= prefs.jumpVyInitial + prefs.jumpIncr - (player.ctJump >> 1);
      if (player.vy < -prefs.jumpVyMax) player.vy = -prefs.jumpVyMax;
      player.ctJump++;
      if (player.ctJump === 16) player.jumping = 0;
    }
  } else {
    player.jumping = 0;
  }

  // ==========================
  // HORIZONTAL MOVEMENT
  // ==========================
  if (!(keyboard.isDown(SC_LEFT) || keyboard.isDown(SC_RIGHT))) {
    if (player.vx > 0) {
      player.vx -= prefs.walkFr;
      if (player.vx < 0) { player.vx = 0; player.x = x << 6; }
    } else if (player.vx < 0) {
      player.vx += prefs.walkFr;
      if (player.vx > 0) { player.vx = 0; player.x = x << 6; }
    }
  }

  if (keyboard.isDown(SC_LEFT)) {
    if (player.vx > -prefs.walkVxMax) {
      player.facing = 6;
      player.vx -= prefs.walkAx;
    }
  }
  if (keyboard.isDown(SC_RIGHT)) {
    if (player.vx < prefs.walkVxMax) {
      player.facing = 0;
      player.vx += prefs.walkAx;
    }
  }

  player.x += player.vx;

  // World bounds (horizontal)
  if (player.x < 0) player.x = 0;
  const maxX = (world.worldW * 16 - 16) << 6;
  if (player.x > maxX) player.x = maxX;

  // Recompute tile coords
  x = player.x >> 6;
  xx = x >> 4;
  y = player.y >> 6;
  yy = y >> 4;

  // --- Horizontal tile collision ---
  if (player.vx < 0) {
    const b1 = worldBehav(world, xx, yy);
    const b2 = (y & 15) !== 0 ? worldBehav(world, xx, yy + 1) : 0;
    if (b1 > 7 || b2 > 7) {
      player.vx = 0;
      player.x = (xx + 1) << 10;
    }
  } else if (player.vx > 0) {
    const b1 = worldBehav(world, xx + 1, yy);
    const b2 = (y & 15) !== 0 ? worldBehav(world, xx + 1, yy + 1) : 0;
    if (b1 > 7 || b2 > 7) {
      player.vx = 0;
      player.x = xx << 10;
    }
  } else {
    player.x = x << 6;
  }

  // Final tile coords
  x = player.x >> 6;
  xx = x >> 4;
  y = player.y >> 6;
  yy = y >> 4;

  // ==========================
  // KEYHOLE UNLOCKING
  // ==========================
  if ((y & 15) === 0 && (x & 15) === 0 && player.keys > 0) {
    let opened = false;
    if (keyboard.isDown(SC_LEFT)) opened = worldClearKeyHole(world, map, xx - 1, yy);
    if (!opened && keyboard.isDown(SC_RIGHT)) opened = worldClearKeyHole(world, map, xx + 1, yy);
    if (opened) {
      player.keys--;
      playSfx(1);
    }
  }

  // ==========================
  // EVIL TILES (behaviour == 1)
  // ==========================
  const ev1 = worldBehav(world, xx, yy) === 1;
  const ev2 = (x & 15) !== 0 && worldBehav(world, xx + 1, yy) === 1;
  const ev3 = (y & 15) !== 0 && worldBehav(world, xx, yy + 1) === 1;
  const ev4 = (x & 15) !== 0 && (y & 15) !== 0 && worldBehav(world, xx + 1, yy + 1) === 1;
  if (ev1 || ev2 || ev3 || ev4) {
    playSfx(7);
    if (player.state === STATENORMAL) {
      playSfx(8, false, 11025 + ((Math.random() * 1024) | 0));
      player.lives--;
      player.state = STATEFLICKER;
      player.ctState = 128;
    }
    if (player.vy < 0) {
      player.vy = prefs.gMaxVy;
      player.y = (yy + 1) << 10;
    } else {
      player.vy = -prefs.gMaxVy;
      player.y = yy << 10;
    }
  }
}
