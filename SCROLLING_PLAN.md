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

- Iterates all `mapW * mapH = 36` screens
- For each screen, copies its 20×12 tiles into the correct region of the 120×72 world buffer
- Sets `behaviour` from `tileProperties`, `anim` flag, `realMapIndex`
- Screen (sx, sy) maps to world offset: `(sy*screenH)*worldW + sx*screenW`
- Called **once** at game start, not per-frame

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

Changes:
- Enemy positions become **world-absolute** instead of per-screen
- On world buffer init, each enemy's position is offset by its screen's world position:
  ```
  e.x += sx * screenW * 16   // world pixel X
  e.y += sy * screenH * 16   // world pixel Y
  e.x1 += offset; e.x2 += offset  // boundaries too
  ```
- Movement unchanged (`e.x += e.mx`)
- Rendering: `(e.x - camera.x, e.y - camera.y)` for screen position
- No more per-screen `enems[nPant]` indexing — flat array of all enemies

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
