/** Phase 7 — Rendering helpers (engineScreenDrawLayer*, hotspots, stats) */
import type { TypePrefs, TypeTileLayers, TypeHotSpots, TypePlayer } from "./types";
import type { Screen } from "../screen";
import { LAYER_1 } from "../screen";
import { getCachedFont } from "../assets/fnt-cache";

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
 * engineRprint — mirrors ENGINE.BAS engineRprint:
 *   DQBprint Layer%, Text$, x% + 1, y% + 1, 255   (shadow)
 *   DQBprint Layer%, Text$, x%, y%, 254             (foreground)
 *
 * Renders FNT glyphs with palette color.
 * Falls back to colored rectangles if FNT not yet loaded.
 */
function drawFntText(
  screen: Screen,
  layer: number,
  text: string,
  x: number,
  y: number,
  palCol: number,
  font: NonNullable<ReturnType<typeof getCachedFont>>,
): void {
  let curX = x;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const glyph = font.chars.get(code);
    if (!glyph) { curX += (font.charWidth || 8); continue; }
    const gh = glyph.height;
    const gd = glyph.data;
    const gw = glyph.width;
    for (let gy = 0; gy < gh; gy++) {
      const py = y + gy;
      if (py < 0 || py >= 200) continue;
      const row = gd[gy];
      for (let gx = 0; gx < gw; gx++) {
        if (row & (0x80 >> gx)) {
          const px = curX + gx;
          if (px >= 0 && px < 320) screen.putPixel(layer, px, py, palCol);
        }
      }
    }
    curX += gw;
  }
}

export function engineRprint(
  screen: Screen,
  layer: number,
  text: string,
  x: number,
  y: number,
  _fgCol: number = 254,
): void {
  const font = getCachedFont();
  if (!font) {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === " ") continue;
      const cx = x + i * 7;
      screen.fillRect(layer, cx + 1, y + 1, 6, 8, 255);
      screen.fillRect(layer, cx, y, 6, 8, 15);
    }
    return;
  }
  drawFntText(screen, layer, text, x + 1, y + 1, 255, font);
  drawFntText(screen, layer, text, x, y, 254, font);
}

/**
 * dqbPrint — mirrors DirectQB DQBprint:
 * Renders a single line of FNT text at (x, y) using the given palette colour.
 * DirectQB FNT: each glyph is 8 bytes (rows), bits MSB-first = pixels.
 */
export function dqbPrint(
  screen: Screen,
  layer: number,
  text: string,
  x: number,
  y: number,
  palCol: number,
): void {
  const font = getCachedFont();
  if (!font) {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === " ") continue;
      screen.fillRect(layer, x + i * 7, y, 6, 8, palCol);
    }
    return;
  }
  drawFntText(screen, layer, text, x, y, palCol, font);
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
