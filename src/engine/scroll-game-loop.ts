/**
 * Scroll-mode game loop — camera-based smooth scrolling.
 * Replaces engineDoGame when config.scrollEnabled is true.
 */
import { Screen, LAYER_1, LAYER_2, LAYER_3, VIDEO } from "../screen";
import { Keyboard, SC_W, SC_E, SC_R } from "../keyboard";
import type { TypePrefs, TypePlayer, TypeSpriteProperties, TypeHotSpots } from "./types";
import { config } from "./config";
import type { WorldBuff, Camera } from "./scroll-types";
import { updateCamera } from "./scroll-camera";
import { scrollDrawLayer1, scrollDrawLayer2 } from "./scroll-render";
import { scrollMovePlayer } from "./scroll-player";
import { scrollMoveEnemies } from "./scroll-enemies";
import { enginePrintStats, engineRprint } from "./render";
import type { PlaySfx, StopSfx } from "./player";

export type { PlaySfx, StopSfx } from "./player";

export type ScrollDoGameResult = -2 | -1 | 0;

export interface ScrollDoGameOpts {
  screen: Screen;
  keyboard: Keyboard;
  prefs: TypePrefs;
  spriteProperties: TypeSpriteProperties[];
  spriteMapping: number[];
  tileset: { width: number; height: number; data: Uint8Array };
  spriteset: { width: number; height: number; data: Uint8Array };
  world: WorldBuff;
  camera: Camera;
  enemies: TypeEnems[];
  hotSpots: TypeHotSpots[];
  player: TypePlayer;
  backdrop?: { width: number; height: number; data: Uint8Array } | null;
  playSfx?: PlaySfx;
  stopSfx?: StopSfx;
  onFrame?: (state: { frame: number; player: TypePlayer }) => void;
}

import type { TypeEnems } from "./types";

export async function scrollDoGame(opts: ScrollDoGameOpts): Promise<ScrollDoGameResult> {
  const {
    screen, keyboard, prefs, spriteProperties, spriteMapping,
    tileset, spriteset, world, camera, player,
  } = opts;
  const playSfx: PlaySfx = opts.playSfx ?? (() => {});
  const stopSfx: StopSfx = opts.stopSfx ?? (() => {});
  const enemies = opts.enemies;
  const hotSpots = opts.hotSpots;

  const worldPxW = world.worldW * 16;
  const worldPxH = world.worldH * 16;

  let frame = 0;
  let subFrame = 0;
  let logicAccum = 0;

  let res: ScrollDoGameResult | null = null;
  let running = true;

  // Start ambient loops
  if (prefs.bgL1) playSfx(prefs.bgL1, true);
  if (prefs.bgL2) playSfx(prefs.bgL2, true);

  // Backdrop: draw to LAYER_3, copy to LAYER_2 as background base
  const backdrop = opts.backdrop;
  screen.clearLayer(LAYER_3);
  if (backdrop) {
    const dstIdx = screen.getLayerIndices(LAYER_3);
    const dstU32 = screen.getLayerU32(LAYER_3);
    const curLut = screen.getPaletteLut();
    const bw = backdrop.width, bh = backdrop.height;
    const by = prefs.screenPos?.y ?? 0;
    for (let y = 0; y < bh; y++) {
      const py = by + y;
      if (py < 0 || py >= 200) continue;
      const dRow = py * 320;
      const sRow = y * bw;
      for (let x = 0; x < bw && x < 320; x++) {
        const pal = backdrop.data[sRow + x];
        if (pal === 0) continue;
        const di = dRow + x;
        dstIdx[di] = pal;
        dstU32[di] = curLut[pal];
      }
    }
  }
  screen.copyLayer(LAYER_3, LAYER_2);

  // Initialize camera on player
  updateCamera(camera, player, worldPxW, worldPxH);

  const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

  while (running) {
    await nextFrame();

    // --- Camera updates every frame (smooth) ---
    updateCamera(camera, player, worldPxW, worldPxH);

    // --- Physics ticks via accumulator ---
    logicAccum += config.gameSpeed;
    const tickNow = logicAccum >= 1.0;
    if (tickNow) logicAccum -= 1.0;

    if (tickNow) {
      scrollMovePlayer(keyboard, world, player, prefs, playSfx);
      scrollMoveEnemies(enemies, world, prefs, player, playSfx);

      // Animation frame cycling
      subFrame = (subFrame + 1) & 3;
      if (subFrame === 0) {
        frame = (frame + 1) & 3;
        if (frame === 4) frame = 0;
      }

      // Player sprite selection
      if (spriteMapping.length > 0) {
        if (player.vy < 0) {
          player.sprId = spriteMapping[player.facing + 4] ?? player.sprId;
        } else if (player.vy > 0) {
          player.sprId = spriteMapping[player.facing + 5] ?? player.sprId;
        } else if (player.vx !== 0) {
          player.sprId = spriteMapping[player.facing + player.frame] ?? player.sprId;
          player.subFrame = (player.subFrame + 1) & 3;
          if (player.subFrame === 0) player.frame = (player.frame + 1) & 3;
        } else {
          player.sprId = spriteMapping[player.facing] ?? player.sprId;
        }
      }

      // Enemy sprite frames
      for (const e of enemies) {
        if (e.t === 0) continue;
        e.subFrame = (e.subFrame + 1) & 3;
        if (e.subFrame === 0) e.frame = (e.frame + 1) & 3;
        e.facing = (e.mx + e.my > 0) ? 0 : 4;
        const sid = 12 + ((e.t - 1) << 3) + e.facing + e.frame;
        if (sid < spriteMapping.length) e.sprId = spriteMapping[sid] ?? e.sprId;
      }
    }

    // --- Hotspot collection ---
    {
      const px = player.x >> 6;
      const py = player.y >> 6;
      for (const hs of hotSpots) {
        if (!hs.s || hs.t === 0) continue;
        const hx = hs.x * 16;
        const hy = hs.y * 16;
        if (px >= hx - 15 && px <= hx + 15 && py >= hy - 15 && py <= hy + 15) {
          hs.s = false;
          if (hs.t === 1) { player.objects++; playSfx(6); }
          else if (hs.t === 2) { player.keys++; playSfx(4); }
          else if (hs.t === 3) { player.lives += prefs.refill; playSfx(5); }
        }
      }
    }

    // --- Render ---
    // Background: LAYER_2
    screen.clearLayer(LAYER_2);
    scrollDrawLayer1(screen, world, camera, tileset, LAYER_2);

    // Composite: LAYER_2 → LAYER_1
    screen.copyLayer(LAYER_2, LAYER_1);

    // Player sprite
    if (!player.gameOver) {
      const showPlayer = player.state === 0 || logicAccum < 0.5;
      if (showPlayer) {
        const px = (player.x >> 6) - camera.x;
        const py = (player.y >> 6) - camera.y;
        const off = spriteProperties[player.sprId] ?? { offX: 0, offY: 0 };
        screen.blitSprite(LAYER_1, spriteset, player.sprId, px - off.offX, py - off.offY);
      }
    }

    // Enemy sprites
    for (const e of enemies) {
      if (e.t === 0) continue;
      const sx = e.x - camera.x;
      const sy = e.y - camera.y;
      if (sx < -24 || sx > 320 || sy < -24 || sy > 200) continue;
      const off = spriteProperties[e.sprId] ?? { offX: 0, offY: 0 };
      screen.blitSprite(LAYER_1, spriteset, e.sprId, sx - off.offX, sy - off.offY);
    }

    // Animated layer2 tiles
    scrollDrawLayer2(screen, world, camera, tileset, frame, LAYER_1);

    // HUD stats (fixed position)
    enginePrintStats(screen, player, prefs, tileset);

    // Final composite
    screen.copyLayer(LAYER_1, VIDEO);
    screen.present();
    opts.onFrame?.({ frame, player });

    // --- Cheat W+E+R ---
    if (keyboard.isDown(SC_W) && keyboard.isDown(SC_E) && keyboard.isDown(SC_R)) {
      player.objects++;
      keyboard.clear();
      await new Promise<void>((r) => setTimeout(r, 200));
    }

    // --- Win/Loss ---
    if (player.objects >= prefs.maxObjs) { res = -1; running = false; }
    else if (player.lives < 0) { res = -2; player.gameOver = -1; }

    // --- Game Over display ---
    if (player.gameOver === -1) {
      engineRprint(screen, LAYER_1, "GAME OVER", 123, 95);
      screen.copyLayer(LAYER_1, VIDEO);
      screen.present();
      await new Promise<void>((r) => setTimeout(r, 2000));
      running = false;
    }

    // --- Exit via Escape ---
    if (keyboard.isDown(0x01)) { res = 0; running = false; }
  }

  // Cleanup
  if (prefs.bgL1) stopSfx(5);
  if (prefs.bgL2) stopSfx(6);
  return res ?? 0;
}
