/**
 * Scroll camera — follow player with clamping to world bounds.
 */
import type { Camera } from "./scroll-types";
import type { TypePlayer } from "./types";

const SPRITE_HALF_W = 12;
const SPRITE_HALF_H = 12;

/**
 * Center camera on player, clamp to world pixel bounds.
 * @param cam — mutable camera position
 * @param player — player with fixed-point coords (1/64 px)
 * @param worldPxW — world width in pixels (worldW * 16)
 * @param worldPxH — world height in pixels (worldH * 16)
 */
export function updateCamera(
  cam: Camera,
  player: TypePlayer,
  worldPxW: number,
  worldPxH: number,
): void {
  const px = player.x >> 6;
  const py = player.y >> 6;

  // Center on player
  cam.x = px + SPRITE_HALF_W - 160;  // 160 = 320/2
  cam.y = py + SPRITE_HALF_H - 100;  // 100 = 200/2

  // Clamp to world bounds
  if (cam.x < 0) cam.x = 0;
  if (cam.y < 0) cam.y = 0;
  if (cam.x > worldPxW - 320) cam.x = worldPxW - 320;
  if (cam.y > worldPxH - 200) cam.y = worldPxH - 200;
}
