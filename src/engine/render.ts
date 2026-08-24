/** Phase 7 — Rendering helpers (engineScreenDrawLayer*, hotspots, stats) */
import type { TypePrefs, TypeTileLayers, TypeHotSpots, TypePlayer } from "./types";
import type { Screen } from "../screen";
import { LAYER_1 } from "../screen";

/** Mirrors ENGINE.BAS: engineScreenDrawLayer1 — layer1 tiles → target (usually LAYER_2) */
export function engineScreenDrawLayer1(
  screen: Screen,
  tileset: { width: number; height: number; data: Uint8Array },
  prefs: TypePrefs,
  curScreenBuff: TypeTileLayers[],
  targetLayer: number,
): void {
  let x = 0, y = 0;
  const screenPixelW = 16 * prefs.screenW;
  let idx = 23; // skip letterbox top row
  for (let i = 0; i < prefs.screenH; i++) {
    for (let j = 0; j < prefs.screenW; j++) {
      const id = curScreenBuff[idx].layer1;
      if (id) screen.blitTile(targetLayer, tileset, id, prefs.screenPos.x + x, prefs.screenPos.y + y);
      x += 16;
      if (x === screenPixelW) { x = 0; y += 16; }
      idx++;
    }
    idx += 2; // border columns
  }
}

/** Mirrors engineScreenDrawLayer2 — layer2 tiles → target (usually VIDEO/LAYER_1), anim = frame%4 */
export function engineScreenDrawLayer2(
  screen: Screen,
  tileset: { width: number; height: number; data: Uint8Array },
  prefs: TypePrefs,
  curScreenBuff: TypeTileLayers[],
  frame: number,
  targetLayer: number,
): void {
  let x = 0, y = 0;
  const screenPixelW = 16 * prefs.screenW;
  let idx = 23;
  for (let i = 0; i < prefs.screenH; i++) {
    for (let j = 0; j < prefs.screenW; j++) {
      let id = curScreenBuff[idx].layer2;
      if (curScreenBuff[idx].anim) id = id + (frame & 3);
      if (id) screen.blitTile(targetLayer, tileset, id, prefs.screenPos.x + x, prefs.screenPos.y + y);
      x += 16;
      if (x === screenPixelW) { x = 0; y += 16; }
      idx++;
    }
    idx += 2;
  }
}

/** Mirrors engineDrawHotSpots */
export function engineDrawHotSpots(
  screen: Screen,
  nPant: number,
  tileset: { width: number; height: number; data: Uint8Array },
  prefs: TypePrefs,
  hotSpots: TypeHotSpots[],
  hotSpotsTiles: number[], // [0-unused, objectTile, keyTile, lifeTile]
  targetLayer: number = LAYER_1,
): void {
  const hs = hotSpots[nPant];
  if (!hs || !hs.s) return;
  const nTile = hotSpotsTiles[hs.t] ?? 0;
  if (!nTile) return;
  const x = hs.x << 4; // DQBshiftLeft(x,4)
  const y = hs.y << 4;
  screen.blitTile(targetLayer, tileset, nTile, prefs.screenPos.x + x, prefs.screenPos.y + y);
}

/** Minimal number formatter — mirrors engineMakeNumber$ */
function makeNumber(digits: number, value: number): string {
  const b = String(Math.trunc(value));
  return b.length < digits ? "0".repeat(digits - b.length) + b : b;
}

/**
 * Very small 6×8 font stub for stats — Phase 7 doesn't have FNT yet,
 * so we render numbers via tiny filled boxes + DOM-style via screen primitives.
 * engineRprint = shadow (col 255) + foreground (254). Here we emulate via
 * filterBox-like rects if bmap missing, else simple rects.
 * For now we render `Text` as colored rectangles approximating chars.
 * Will be replaced by FNT blit in Phase 10.
 */
export function engineRprint(
  screen: Screen,
  layer: number,
  text: string,
  x: number,
  y: number,
  _fgCol: number = 254,
): void {
  // Placeholder: draw each char as 6×8 solid block with palette 15/0 checker
  // This is visible enough for HUD verification before FNT is ported.
  // Later phases replace with proper FNT glyph blit.
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === " ") continue;
    const cx = x + i * 7;
    // Shadow
    screen.fillRect(layer, cx + 1, y + 1, 6, 8, 255);
    // Foreground — palette 15 white for stats
    screen.fillRect(layer, cx, y, 6, 8, 15);
    // Cheap glyph hint: char code mod pattern
    const code = ch.charCodeAt(0);
    if ((code & 1) === 0) screen.fillRect(layer, cx + 1, y + 2, 4, 1, 0);
    else screen.fillRect(layer, cx + 1, y + 5, 4, 1, 0);
  }
}

/** Mirrors enginePrintStats — icons + counts */
export function enginePrintStats(
  screen: Screen,
  player: TypePlayer,
  prefs: TypePrefs,
  tileset: { width: number; height: number; data: Uint8Array },
  // spriteset unused in original stats (kept for signature compat)
  _spriteset?: { width: number; height: number; data: Uint8Array },
): void {
  const layer = 1; // original hardcodes layer 1
  // Icons
  screen.blitTile(layer, tileset, prefs.objectTile, 4, 4);
  screen.blitTile(layer, tileset, prefs.keyTile, 4, 20);
  screen.blitTile(layer, tileset, prefs.lifeTile, 4, 36);
  // Numbers — shadow + fg
  const lives = player.lives >= 0 ? player.lives : 0;
  engineRprint(screen, layer, `x${makeNumber(2, player.objects)}`, 20, 4, 254);
  engineRprint(screen, layer, `x${makeNumber(2, player.keys)}`, 20, 20, 254);
  engineRprint(screen, layer, `x${makeNumber(2, lives)}`, 20, 36, 254);
}
