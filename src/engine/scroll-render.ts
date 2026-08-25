/**
 * Scroll renderer — draws tiles from world buffer with camera offset.
 */
import { Screen } from "../screen";
import type { WorldBuff, Camera } from "./scroll-types";

const TILE = 16;

/**
 * Draw background tiles (layer1) from world buffer to target layer.
 * Covers 21×14 tiles to ensure full 320×200 coverage with sub-tile offset.
 */
export function scrollDrawLayer1(
  screen: Screen,
  world: WorldBuff,
  cam: Camera,
  tileset: { width: number; height: number; data: Uint8Array },
  targetLayer: number,
): void {
  const startTX = cam.x >> 4;
  const startTY = cam.y >> 4;
  const offX = -(cam.x & 15);
  const offY = -(cam.y & 15);

  for (let row = 0; row <= 13; row++) {
    for (let col = 0; col <= 20; col++) {
      const tx = startTX + col;
      const ty = startTY + row;
      if (tx < 0 || tx >= world.worldW || ty < 0 || ty >= world.worldH) continue;
      const tileId = world.layer1[ty * world.worldW + tx];
      if (tileId === 0) continue;
      screen.blitTile(targetLayer, tileset, tileId, offX + col * TILE, offY + row * TILE);
    }
  }
}

/**
 * Draw animated/foreground tiles (layer2) from world buffer to target layer.
 * Animation frame offset applied where world.anim[] is set.
 */
export function scrollDrawLayer2(
  screen: Screen,
  world: WorldBuff,
  cam: Camera,
  tileset: { width: number; height: number; data: Uint8Array },
  frame: number,
  targetLayer: number,
): void {
  const startTX = cam.x >> 4;
  const startTY = cam.y >> 4;
  const offX = -(cam.x & 15);
  const offY = -(cam.y & 15);

  for (let row = 0; row <= 13; row++) {
    for (let col = 0; col <= 20; col++) {
      const tx = startTX + col;
      const ty = startTY + row;
      if (tx < 0 || tx >= world.worldW || ty < 0 || ty >= world.worldH) continue;
      const wIdx = ty * world.worldW + tx;
      let tileId = world.layer2[wIdx];
      if (tileId === 0) continue;
      if (world.anim[wIdx]) tileId += frame & 3;
      screen.blitTile(targetLayer, tileset, tileId, offX + col * TILE, offY + row * TILE);
    }
  }
}

/**
 * Draw a sprite at world-absolute position, converted to screen coords via camera.
 */
export function scrollDrawSprite(
  screen: Screen,
  layer: number,
  spriteset: { width: number; height: number; data: Uint8Array },
  spriteId: number,
  worldX: number,  // pixel coords
  worldY: number,
  cam: Camera,
  spriteProps?: { offX: number; offY: number }[],
): void {
  const sx = worldX - cam.x;
  const sy = worldY - cam.y;
  // Quick bounds check — skip if off-screen
  if (sx < -24 || sx > 320 || sy < -24 || sy > 200) return;
  const off = spriteProps?.[spriteId] ?? { offX: 0, offY: 0 };
  screen.blitSprite(layer, spriteset, spriteId, sx - off.offX, sy - off.offY);
}
