/**
 * Phase 8 — Player physics (ported from ENGINE.BAS:557-701)
 * engineMovePlayer: gravity, jumping, horizontal movement, tile collision,
 * edge detection, keyhole unlocking, evil tiles, flicker state.
 *
 * Fixed-point coords: x,y in 1/64 px. Convert:
 *   worldPixel = fixed >> 6
 *   tileCoord  = fixed >> 10  (>>6 then >>4)
 * Screen edges: x < 0 → DLEFT, x > 19456 → DRIGHT, y < 0 → DUP, y > 11264 → DDOWN
 */
import { Keyboard, SC_LEFT, SC_RIGHT, SC_UP, SC_CTRL } from "../keyboard";
import { STATENORMAL, STATEFLICKER, DLEFT, DRIGHT, DUP, DDOWN, cToIdx } from "./types";
import { engineDetectKeyHole } from "./collision";
import type { TypePlayer, TypeTileLayers, TypePrefs } from "./types";

/** Callback type for triggering sound effects — keeps player.ts decoupled from audio */
export type PlaySfx = (slot: number, loop?: boolean, freq?: number) => void;
/** Callback for stopping a specific voice */
export type StopSfx = (voice: number) => void;
const noopSfx: PlaySfx = () => {};

/**
 * ENGINE.BAS:557 — SUB engineMovePlayer(curScreenBuff, player, prefs, map())
 * Processes one frame of player physics. Sets player.attempt if edge reached.
 *
 * @param keyboard  — Keyboard instance for reading arrow/ctrl state
 * @param curScreenBuff — 22×14 letterboxed tile buffer
 * @param player    — mutable player state
 * @param prefs     — game constants (gravity, speeds, etc.)
 * @param map       — flat tile map (for keyhole removal)
 */
export function engineMovePlayer(
  keyboard: Keyboard,
  curScreenBuff: TypeTileLayers[],
  player: TypePlayer,
  prefs: TypePrefs,
  map: Uint8Array,
  playSfx: PlaySfx = noopSfx,
): void {
  // Reset attempt each frame
  player.attempt = 0;

  // --- Flicker state ---
  if (player.state === STATEFLICKER) {
    player.ctState--;
    if (player.ctState === 0) {
      player.state = STATENORMAL;
    }
  }

  // ==========================
  // VERTICAL MOVEMENT (gravity)
  // ==========================
  player.vy += prefs.g;
  if (player.vy > prefs.gMaxVy) player.vy = prefs.gMaxVy;
  player.y += player.vy;

  // Edge detection (vertical)
  if (player.y < 0) { player.y = 0; player.attempt = DUP; }
  if (player.y > 11264) { player.y = 11264; player.attempt = DDOWN; }

  // If on movable platform, zero vy
  if (player.gotten) player.vy = 0;

  // Recompute tile coords after vertical move
  let y = player.y >> 6;
  let yy = y >> 4;
  let x = player.x >> 6;
  let xx = x >> 4;

  // --- Vertical tile collision ---
  if (player.vy < 0) {
    // Moving up — check ceiling (behaviour > 7)
    const idx1 = cToIdx(xx, yy);
    const idx2 = (x & 15) !== 0 ? cToIdx(xx + 1, yy) : -1;
    if (curScreenBuff[idx1].behaviour > 7 || (idx2 >= 0 && curScreenBuff[idx2].behaviour > 7)) {
      player.vy += prefs.jumpIncr >> 1;
      player.y = (yy + 1) << 10;
      y = player.y >> 6;
      yy = y >> 4;
    }
  } else if (player.vy > 0 && (y & 15) <= (prefs.gMaxVy >> 6)) {
    // Moving down — check floor (behaviour > 3)
    const idx1 = cToIdx(xx, yy + 1);
    const idx2 = (x & 15) !== 0 ? cToIdx(xx + 1, yy + 1) : -1;
    if (curScreenBuff[idx1].behaviour > 3 || (idx2 >= 0 && curScreenBuff[idx2].behaviour > 3)) {
      player.vy = 0;
      player.y = yy << 10;
      y = player.y >> 6;
      yy = y >> 4;
    }
  }

  // ==========================
  // JUMPING (Ctrl or Up arrow)
  // ==========================
  if (keyboard.isDown(SC_CTRL) || keyboard.isDown(SC_UP)) {
    if (player.vy === 0 && !player.jumping) {
      // Must be on ground or on platform
      const onGround =
        player.gotten ||
        curScreenBuff[cToIdx(xx, yy + 1)].behaviour > 3 ||
        ((x & 15) !== 0 && curScreenBuff[cToIdx(xx + 1, yy + 1)].behaviour > 3);
      if (onGround) {
        player.jumping = -1;
        player.ctJump = 0;
        // SFX: JUMP (slot 3) — slight pitch randomisation
        playSfx(3, false, 11025 + ((Math.random() * 1024) | 0));
        player.x = x << 6; // snap to tile grid
      }
    }
    if (player.jumping) {
      player.vy -= prefs.jumpVyInitial + prefs.jumpIncr - (player.ctJump >> 1);
      if (player.vy < -prefs.jumpVyMax) player.vy = -prefs.jumpVyMax;
      player.ctJump++;
      if (player.ctJump === 16) {
        player.jumping = 0;
      }
    }
  } else {
    player.jumping = 0;
  }

  // ==========================
  // HORIZONTAL MOVEMENT
  // ==========================

  // Friction when no left/right key
  if (!(keyboard.isDown(SC_LEFT) || keyboard.isDown(SC_RIGHT))) {
    if (player.vx > 0) {
      player.vx -= prefs.walkFr;
      if (player.vx < 0) { player.vx = 0; player.x = x << 6; }
    } else if (player.vx < 0) {
      player.vx += prefs.walkFr;
      if (player.vx > 0) { player.vx = 0; player.x = x << 6; }
    }
  }

  // Accelerate left
  if (keyboard.isDown(SC_LEFT)) {
    if (player.vx > -prefs.walkVxMax) {
      player.facing = 6;
      player.vx -= prefs.walkAx;
    }
  }

  // Accelerate right
  if (keyboard.isDown(SC_RIGHT)) {
    if (player.vx < prefs.walkVxMax) {
      player.facing = 0;
      player.vx += prefs.walkAx;
    }
  }

  // Apply horizontal velocity
  player.x += player.vx;

  // Edge detection (horizontal)
  if (player.x < 0) { player.x = 0; player.attempt = DLEFT; }
  if (player.x > 19456) { player.x = 19456; player.attempt = DRIGHT; }

  // Recompute tile coords after horizontal move
  x = player.x >> 6;
  xx = x >> 4;
  y = player.y >> 6;
  yy = y >> 4;

  // --- Horizontal tile collision ---
  if (player.vx < 0) {
    // Moving left — check wall (behaviour > 7)
    const idx1 = cToIdx(xx, yy);
    const idx2 = (y & 15) !== 0 ? cToIdx(xx, yy + 1) : -1;
    if (curScreenBuff[idx1].behaviour > 7 || (idx2 >= 0 && curScreenBuff[idx2].behaviour > 7)) {
      player.vx = 0;
      player.x = (xx + 1) << 10;
    }
  } else if (player.vx > 0) {
    // Moving right — check wall (behaviour > 7)
    const idx1 = cToIdx(xx + 1, yy);
    const idx2 = (y & 15) !== 0 ? cToIdx(xx + 1, yy + 1) : -1;
    if (curScreenBuff[idx1].behaviour > 7 || (idx2 >= 0 && curScreenBuff[idx2].behaviour > 7)) {
      player.vx = 0;
      player.x = xx << 10;
    }
  } else {
    // No horizontal velocity — snap to tile grid
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
    if (keyboard.isDown(SC_LEFT)) opened = engineDetectKeyHole(curScreenBuff, map, xx - 1, yy);
    if (keyboard.isDown(SC_RIGHT)) opened = engineDetectKeyHole(curScreenBuff, map, xx + 1, yy);
    if (opened) {
      player.keys--;
      // SFX: BOLT (slot 1) — keyhole unlock
      playSfx(1);
    }
  }

  // ==========================
  // EVIL TILES (behaviour == 1)
  // ==========================
  const ev1 = curScreenBuff[cToIdx(xx, yy)].behaviour === 1;
  const ev2 = (x & 15) !== 0 && curScreenBuff[cToIdx(xx + 1, yy)].behaviour === 1;
  const ev3 = (y & 15) !== 0 && curScreenBuff[cToIdx(xx, yy + 1)].behaviour === 1;
  const ev4 = (x & 15) !== 0 && (y & 15) !== 0 && curScreenBuff[cToIdx(xx + 1, yy + 1)].behaviour === 1;
  if (ev1 || ev2 || ev3 || ev4) {
    // SFX: PINCHE (slot 7) — always plays on evil tile
    playSfx(7);
    if (player.state === STATENORMAL) {
      // SFX: AH (slot 8) — pain vocal only when not already flickering
      playSfx(8, false, 11025 + ((Math.random() * 1024) | 0));
      player.lives--;
      player.state = STATEFLICKER;
      player.ctState = 128;
    }
    // Knockback: reverse vertical velocity
    if (player.vy < 0) {
      player.vy = prefs.gMaxVy;
      player.y = (yy + 1) << 10;
    } else {
      player.vy = -prefs.gMaxVy;
      player.y = yy << 10;
    }
  }
}
