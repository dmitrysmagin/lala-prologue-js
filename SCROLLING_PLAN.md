# Smooth Scrolling — Design Plan

## Core Concept

Replace the current single-screen `curScreenBuff` (22×14) with a **full-map tile buffer** (120×72) and a **camera** that viewport-scrolls across it. The existing flip-screen engine stays untouched as a parallel code path.

---

## 1. New Data Structures

**`src/engine/scroll-types.ts`** (new file)

```
WorldBuff         — flat tile buffer for entire map
  layer1: Uint8Array(mapW*screenW * mapH*screenH)  — 120*72 = 8640 bytes
  layer2: Uint8Array(8640)                          — animated/front tiles
  behaviour: Uint8Array(8640)                       — tile properties
  anim: Uint8Array(8640)                            — animated flag
  realMapIndex: Uint32Array(8640)                   — back-reference to flat map

Camera            — viewport position
  x: number   — pixel X (0..mapW*screenW*16 - 320)
  y: number   — pixel Y (0..mapH*screenH*16 - 200)

ScrollPrefs       — extends TypePrefs with
  worldW: number  — mapW * screenW = 120 tiles
  worldH: number  — mapH * screenH = 72 tiles
```

**Why flat `Uint8Array` instead of `TypeTileLayers[]`?**
- Cache-friendly sequential access
- ~17 KB total vs ~50 KB for object array
- Same structure the flip-screen engine uses internally (just not letterboxed)

---

## 2. World Buffer Initialization

**`src/engine/scroll-map.ts`** (new file)

`scrollWorldPrepare(map, tileProperties, hotSpots, enems) → WorldBuff`

### How Screen-Per-Screen Tiles Become One Map

The flat map stores tiles screen-by-screen: screen 0 (20×12), screen 1 (20×12), ... screen 29 (20×12). `buildWorldBuff` copies each screen's tiles into the correct region of the 120×72 world grid:

```
World layout (6 columns × 5 rows of 20×12 screens):

  Screen 0    Screen 1    ...   Screen 5
  Screen 6    Screen 7    ...   Screen 11
  ...
  Screen 24   Screen 25   ...   Screen 29

World buffer indexing:
  worldIdx = (worldBaseY + ty) * worldW + worldBaseX
  where:
    worldBaseX = sx * screenW    (0, 20, 40, 60, 80, 100)
    worldBaseY = sy * screenH    (0, 12, 24, 36, 48)
```

For each tile in each screen:
1. Look up `tileProperties[tileId]` to determine layer (BACK or ANIMATED)
2. Copy tile ID to `world.layer1` (background) or `world.layer2` (foreground)
3. Set `world.behaviour[worldIdx]` from tile properties flags
4. Set `world.anim[worldIdx]` if tile is animated
5. Store `world.realMapIndex[worldIdx]` as back-reference to flat map

Called **once** at game start, not per-frame.

---

## 3. Scroll Renderer

**`src/engine/scroll-render.ts`** (new file)

`scrollRender(screen, world, camera, tileset, frame, layer)`

Core loop:
```
startTileX = camera.x >> 4          // tile index (floor)
startTileY = camera.y >> 4
offsetX = -(camera.x & 15)          // sub-tile pixel shift (-15..0)
offsetY = -(camera.y & 15)

for row in 0..13:                   // 14 rows (200/16 +1 for partial)
  for col in 0..20:                 // 21 cols (320/16 +1 for partial)
    tx = startTileX + col
    ty = startTileY + row
    if tx < 0 || tx >= worldW || ty < 0 || ty >= worldH: continue
    tileId = world.layer1[ty * worldW + tx]
    screen.blitTile(layer, tileset, tileId, offsetX + col*16, offsetY + row*16)
```

- Draws 21×14 tiles (covers 320+15 × 200+15 pixels for sub-tile offset)
- Animated tiles: `tileId += frame & 3` when `world.anim[...]` is set
- Sprites: drawn at `(entity.x - camera.x, entity.y - camera.y)` instead of absolute positions
- HUD/stats: drawn at **fixed** pixel positions (not affected by camera)

---

## 4. Camera Logic

**`src/engine/scroll-camera.ts`** (new file)

`updateCamera(camera, player, worldW, worldH)`

```
// Center camera on player, clamp to world bounds
camera.x = (player.x >> 6) - 160 + 12   // 12 = sprite half-width
camera.y = (player.y >> 6) - 100 + 12
camera.x = clamp(camera.x, 0, worldW*16 - 320)
camera.y = clamp(camera.y, 0, worldH*16 - 200)
```

- 16px margin at world edges (screenPos.y=4 preserved as camera.y minimum)
- Camera updates **every frame** (not just on physics ticks) for smooth feel

---

## 5. Modified Player Physics

**`src/engine/scroll-player.ts`** (new file, wraps `engineMovePlayer`)

Changes vs current `player.ts`:
- **Edge detection**: instead of setting `player.attempt`, clamp to **world boundaries**:
  ```
  if (player.x < 0) player.x = 0
  if (player.x > (worldW*16 - 16) << 6) player.x = (worldW*16 - 16) << 6
  ```
  Same for Y. No screen transitions — camera follows continuously.
- **Tile collision**: fetch `world.behaviour[tileIndex]` instead of `curScreenBuff[cToIdx(...)]`
- All physics constants (gravity, speeds, jump) remain identical

---

## 6. Modified Enemy Logic

**`src/engine/scroll-enemies.ts`** (new file, wraps `engineMoveEnems`)

### ENEMS.TXT Coordinate System

All values in ENEMS.TXT are **pixel coordinates** (not tile coords):
- `x, y` — enemy starting position (0–319, 0–191)
- `x1, y1, x2, y2` — patrol bounding box (pixel coords, may have x1 > x2)
- `mx, my` — movement speed in pixels/tick (typically ±1–2)
- `t` — enemy type (0 = empty, 1–3 = enemy types, 4 = platform)

The flip-screen engine uses these values directly: `e.x += e.mx`, boundary check `e.x === e.x1`.

### World Conversion (`convertEnemiesToWorld`)

Converts per-screen enemy data to world-absolute pixel coordinates by adding screen offset:

```
offsetX = sx * screenW * 16   // e.g. screen 1 → +320px
offsetY = sy * screenH * 16   // e.g. screen 2 → +192px

e.x  += offsetX;   e.y  += offsetY;
e.x1 += offsetX;   e.y1 += offsetY;
e.x2 += offsetX;   e.y2 += offsetY;
// mx/my unchanged — already pixel-speed
```

All six position fields are shifted by the same screen offset. Patrol bounds stay in the same coordinate space as positions, so `e.x === e.x1` boundary checks work correctly.

### Patrol Bounds (Walking Limiters)

Enemies patrol between `x1/x2` (horizontal) and `y1/y2` (vertical). Bounce uses **exact equality** matching the flip-screen engine:

```
if (e.x === e.x1 || e.x === e.x2) e.mx = -e.mx;
if (e.y === e.y1 || e.y === e.y2) e.my = -e.my;
```

Note: some enemies have inverted bounds (x1 > x2). The `===` check handles this correctly — the enemy bounces when it reaches either bound, regardless of order.

### World-Edge Safety Clamp

Enemies are clamped to world boundaries as a fallback:
```
if (e.x < 0) e.x = 0;          if (e.x > worldPxW-16) e.x = worldPxW-16;
if (e.y < 0) e.y = 0;          if (e.y > worldPxH-16) e.y = worldPxH-16;
```

### No Tile Collision

Enemies do not collide with solid tiles. Direction changes happen only at patrol bounds and world edges. This matches the original flip-screen engine behavior.

### Rendering

Sprites drawn at world-absolute position offset by camera:
```
screenX = e.x - camera.x + screenPos.x
screenY = e.y - camera.y + screenPos.y
```

---

## 7. Game Loop Integration

**`src/engine/scroll-game-loop.ts`** (new file)

`scrollDoGame(opts) → Promise<Result>`

Frame structure:
```
await nextFrame()
// Camera updates every frame (smooth)
updateCamera(camera, player, worldW, worldH)
// Physics ticks via accumulator (same as current)
logicAccum += config.gameSpeed
if (logicAccum >= 1.0):
  engineMovePlayer(...)   // world-clamped
  engineMoveEnems(...)    // world-absolute
  logicAccum -= 1.0
// Render every frame
scrollRender(screen, world, camera, ...)
// Sprites at (entity.x - camera.x, entity.y - camera.y)
// HUD at fixed positions
screen.present()
```

---

## 8. Flip-Screen Engine — Untouched

The existing `game-loop.ts`, `player.ts`, `enemies.ts`, `collision.ts`, `render.ts` remain exactly as-is. They operate on `curScreenBuff` (22×14) with instant screen transitions. No modifications needed.

---

## 9. Engine Selection

**`src/main.ts`** changes:

```ts
const useScroll = config.scrollEnabled;  // toggle in config.ts

if (useScroll) {
  const world = scrollWorldPrepare(map, tileProperties, hotSpots, enems);
  // Convert enemy positions to world-absolute
  convertEnemiesToWorld(enems, prefs);
  res = await scrollDoGame({ screen, keyboard, world, camera, ... });
} else {
  res = await engineDoGame({ screen, keyboard, ... });  // existing flip-screen
}
```

---

## 10. File Summary

| New File | Purpose |
|---|---|
| `src/engine/scroll-types.ts` | WorldBuff, Camera interfaces |
| `src/engine/scroll-map.ts` | Build world buffer from flat map + tile data |
| `src/engine/scroll-render.ts` | Tile rendering with camera offset |
| `src/engine/scroll-camera.ts` | Camera follow + clamping |
| `src/engine/scroll-player.ts` | Player physics with world bounds |
| `src/engine/scroll-enemies.ts` | Enemy movement with world-absolute coords |
| `src/engine/scroll-game-loop.ts` | Scroll-mode game loop |

| Modified File | Change |
|---|---|
| `src/engine/config.ts` | Add `scrollEnabled: boolean` |
| `src/main.ts` | Engine selection branch |
| `src/engine/types.ts` | Export `WorldBuff` type |

| Unchanged | Reason |
|---|---|
| `game-loop.ts`, `player.ts`, `enemies.ts`, `render.ts`, `collision.ts` | Flip-screen engine stays as-is |
