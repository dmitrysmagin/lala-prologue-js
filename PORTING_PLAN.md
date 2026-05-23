# LaLa → TypeScript + Web APIs — Porting Plan

A step-by-step plan to port the DOS QuickBasic 4.5 game **LaLa** (using DirectQB + Bisqwit's FM engine) to TypeScript running in the browser.

## Project structure

```
lala-js/
├── public/               # Static game assets (copied from lala-qb/)
│   ├── GFX/              # PCX images, FNT font, BMA blender map, TXT data
│   ├── MAP/              # LALA.MAP, TILEPROP.TXT, ENEMS.TXT, HOTSPOTS.TXT
│   ├── MUSIC/            # S3M tracker files (DESORUIN, G66A, MC12, EFFECTS)
│   └── SFX/              # WAV sound effects (10 files)
├── src/
│   ├── main.ts           # Entry point — init, game loop
│   ├── screen.ts         # Virtual VGA: layers, palette, blitting
│   ├── keyboard.ts       # Scancode-based keyboard input
│   ├── assets.ts         # All loaders: PCX, FNT, BMA, MAP, TXT, WAV
│   ├── audio/
│   │   ├── music-player.ts      # Main-thread AudioWorkletNode controller
│   │   ├── s3m-format.ts        # S3M parser (ported from FMENGINE.BAS)
│   │   ├── s3m-worklet.ts       # AudioWorkletProcessor (runs OPL3 + S3M)
│   │   └── sound-effects.ts     # WAV playback via Web Audio API
│   ├── engine/
│   │   ├── types.ts             # TypePrefs, TypePlayer, TypeTileLayers, etc.
│   │   ├── prefs.ts             # engineInitVals — game constants
│   │   ├── game-loop.ts         # engineDoGame — main loop
│   │   ├── player.ts            # engineMovePlayer — physics + collision
│   │   ├── enemies.ts           # engineMoveEnems — AI + platform riding
│   │   ├── render.ts            # Screen draw, stats, hotspots
│   │   ├── map.ts               # Screen preparation, tile → layer mapping
│   │   └── collision.ts         # engineDetectCollision, engineDetectKeyHole
│   └── states/
│       ├── title.ts             # showTitle — title screen
│       └── ending.ts            # showEnding — ending sequence
├── lib/
│   └── opl3.js                  # Pure-JS OPL3/YMF262 emulator (from external project)
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Phases

---

### Phase 0 — Project skeleton (`step-0`)

- Initialize TS project with Vite
- `index.html` with a `<canvas>` element, CSS (black background, centered, `image-rendering: pixelated`)
- `src/main.ts` entry point that gets a 2D context, draws a single colored pixel
- Copy all game assets from `lala-qb/` into `public/`

Files created: `index.html`, `src/main.ts`, `package.json`, `tsconfig.json`, `vite.config.ts`

---

### Phase 1 — Asset loaders (`step-1`)

- **PCX decoder** → decode tileset, spriteset, backdrop, title, ending images into `ImageData` arrays (256-color indexed → RGBA via palette). 256-color PCX format is well-documented; ~50 lines suffices.
- **FNT decoder** → parse `LALA.FNT` into a bitmap glyph lookup table
- **BMA decoder** → load the blender map (256×256 byte lookup table for col 254/255 effects)
- **Binary MAP loader** → `LALA.MAP` bytes → flat `Uint8Array` of tile indices (36 screens × 20 × 12)
- **TXT loaders** → parse `TILEPROP.TXT`, `SPRPROP.TXT`, `SPRMAP.TXT`, `ENEMS.TXT`, `HOTSPOTS.TXT`
- **WAV decoder** → `fetch` + `AudioContext.decodeAudioData()` → store in lookup table
- Bundle all into `async function init(): Promise<GameAssets>`

Files created: `src/assets.ts`, `src/pcx.ts`, `src/fnt.ts`, `src/bma.ts`

---

### Phase 2 — Rendering surface ("Virtual VGA") (`step-2`)

- `Screen` class wrapping multiple offscreen `ImageData` buffers (320×200 RGBA each)
- Layer model: `VIDEO` (0), `LAYER_1`, `LAYER_2`, `LAYER_3`, matching DirectQB's layer concept
- Methods: `clearLayer(id)`, `copyLayer(src, dst)`, `putPixel`, `drawRect`, `fillRect`, `filterBox(x1,y1,x2,y2,col,bmapId)`, `setPalette(rgbaLut)`
- Blit to canvas via `putImageData` driven by `requestAnimationFrame` at 60fps
- Palette system: 768-byte palette → `Uint32Array(256)` RGBA lookup. `setPal`, `getPal`, `palOff`, `fadeTo`, `fadeIn`

Files created: `src/screen.ts`

---

### Phase 3 — Sprite/tile blitter (`step-3`)

- `blitTile(layerId, tileset, tileIndex, screenX, screenY)` — copy 16×16 tile
- `blitSprite(layerId, spriteset, spriteIndex, screenX, screenY)` — copy 24×24 sprite with offset from `spriteProperties[]`
- Transparency: color index 0 is skipped during copy (matching `DQBsetTransPut` / `DQBsetSolidPut`)
- `blitFromLayer(srcLayer, dstLayer, sx, sy, sw, sh, dx, dy)` — matches `DQBput`/`DQBget` patterns

Methods added to `Screen` class.

---

### Phase 4 — Keyboard input (`step-4`)

- `Keyboard` class wrapping `keydown`/`keyup` events
- Internal `Set<number>` of pressed scancodes
- Scancode mapping (original → JS key):

| Key | QB scancode (hex) | JS event code |
|-----|--------------------|---------------|
| Ctrl | 0x1D | `ControlLeft` / `ControlRight` |
| Enter | 0x1C | `Enter` |
| ← | 0x4B | `ArrowLeft` |
| ↑ | 0x48 | `ArrowUp` |
| → | 0x4D | `ArrowRight` |
| W | 0x11 | `KeyW` |
| E | 0x12 | `KeyE` |
| R | 0x13 | `KeyR` |

- Methods: `isDown(scancode)`, `readKey()` (dequeue), `inkey()` (dequeue char), `waitKey(sc)`, `clear()`
- Character queue for `DQBinkey$` semantics

Files created: `src/keyboard.ts`

---

### Phase 5 — Game data structures + config (`step-5`)

Port all QB `TYPE` definitions to TypeScript interfaces:

```ts
interface TypePrefs { /* mapW, mapH, screenW, screenH, physics constants, file names, ... */ }
interface TypePlayer { x, y, vx, vy, frame, facing, subFrame, sprId, gotten, jumping, ctJump, lives, objects, keys, attempt, state, ctState, gameOver }
interface TypeTileLayers { layer1: number, layer2: number, behaviour: number, anim: boolean, realMapIndex: number }
interface TypeTileProperties { location: number, flags: number }
interface TypeSpriteProperties { offX: number, offY: number }
interface TypeEnems { x, y, x1, y1, x2, y2, mx, my, t, facing, frame, subFrame, sprId }
interface TypeHotSpots { x, y, t, s: boolean }
```

Port data loading functions:
- `engineInitVals` → hardcoded pref constants as `TypePrefs`
- `engineLoadPrefs` → assign from prefs store
- `engineLoadTileProperties`, `engineLoadTileset`, `engineLoadSpriteProperties`, `engineLoadSpriteset`, `engineLoadSpriteMapping`, `engineMapLoad`, `engineLoadEnems`, `engineLoadHotSpots`

Wire into the `init()` sequence from Phase 1.

Files created: `src/engine/types.ts`, `src/engine/prefs.ts`, `src/engine/map.ts`

---

### Phase 6 — Title screen + startup flow (`step-6`)

Port `showTitle`:
- Load `TITLE.PCX` onto layer 3, copy to layer 1 (→ `VIDEO`)
- Start music (`G66A.S3M` — send to AudioWorklet)
- Call `engineDoGame` with `flag=0` (title mode — renders "PRESS ENTER TO PLAY")
- On Enter key, return to main loop which starts real game
- All palette fade effects

Visual milestone: see the title screen, press Enter to trigger game start.

Files created: `src/states/title.ts`

---

### Phase 7 — Core game loop (`step-7`)

Port `engineDoGame` — the heart of the game:

- **Screen preparation** (`engineScreenPrepare`): given `nPant` (screen index 0–35), read from flat map array + tile properties → populate `curScreenBuff[308]` (22×14 letterboxed buffer). The visible area is 20×12; the 1-tile border simplifies collision bounds-checking.
  - `cToIdx(x, y)` = `1 + x + (y+1) * 22`
  - Each tile's `location` determines `layer1` (background/back) vs `layer2` (foreground/front), `behaviour` from `flags`, `anim` flag for animated tiles

- **Layer rendering**:
  - `engineScreenDrawLayer1`: iterate buffer, blit `layer1` tiles to layer 2
  - `engineScreenDrawLayer2`: iterate buffer, blit `layer2` tiles to layer 1, add `frame % 4` for animated tiles

- **Frame loop** (via `requestAnimationFrame`):
  1. `DQBwait(1)` → advance frame counter (60fps throttle)
  2. Move player + enemies
  3. Check screen transition (`player.attempt`)
  4. Check hotspot collection
  5. Calculate animation frames
  6. Render: backdrop copy → draw player sprite → draw enemy sprites → draw layer2 tiles → draw hotspots → draw stats HUD → present to screen
  7. Cheat check (W+E+R)
  8. Win/loss check

- **Screen transitions**: when player moves past edge, update `nPant`, re-prepare screen buffer, copy new backdrop, re-draw layer1 tiles

- **Stats HUD**: `enginePrintStats` — draw object/key/life icons in top-left corner with count text (`engineRprint` with shadow)

- **`screenPos.y = 4`**: the 320×200 VGA display shows pixels starting 4 rows down

Files created: `src/engine/game-loop.ts`, `src/engine/render.ts`

---

### Phase 8 — Player physics (`step-8`)

Port `engineMovePlayer`:

- **Fixed-point coordinates**: `x` and `y` stored as integers in 1/64 pixel units (matching original `x << 6`). Conversion: `worldPixels = fixed >> 6`, `tileCoord = fixed >> 10` (i.e. `>> 6` then `>> 4`).

- **Gravity**: `vy += g` (g=12), capped at `gMaxVy=192`. `y += vy`

- **Jumping** (Ctrl or ArrowUp held):
  - Only if on ground (standing on solid tile or platform)
  - `vy -= jumpVyInitial + jumpIncr - ctJump / 2` each frame held
  - Capped at `-jumpVyMax`, max duration 16 frames (`ctJump`)
  - Release key → `jumping = false`, gravity resumes

- **Horizontal movement**:
  - ArrowLeft: `vx -= walkAx` (16), capped at `-walkVxMax` (-128), `facing = 6`
  - ArrowRight: `vx += walkAx`, capped at `walkVxMax` (128), `facing = 0`
  - No key: friction `walkFr` (24) decelerates toward 0

- **Tile collision** (4-point check using `cToIdx`):
  - Collision with walls/ceilings (`behaviour > 7`): stop horizontal/vertical movement, snap to tile boundary (`x = (xx+1) << 10` for left wall, etc.)
  - Ground collision (`behaviour > 3`): stop downward velocity, snap to tile top
  - Uses `(y & 15) != 0` checks to handle sub-tile positions properly

- **Edge detection**: `x < 0` → `attempt = DLEFT`, `x > 19456` → `attempt = DRIGHT`, `y < 0` → `attempt = DUP`, `y > 11264` → `attempt = DDOWN`. These trigger screen transitions in the main loop.

- **Keyhole unlocking**: when standing still on a tile boundary with keys, pressing toward a keyhole tile (`behaviour == 10`) removes it from the map.

- **Evil tiles** (`behaviour == 1`): triggers damage + knockback (reverse vertical velocity).

- **Flicker state**: after damage, `state = STATEFLICKER` for 128 frames → player blinks (rendered every other frame).

Files created: `src/engine/player.ts`

---

### Phase 9 — Enemy AI + collision (`step-9`)

Port `engineMoveEnems`:

- 4 enemies per screen, types:
  - Type 1: horizontal patroller (`mx != 0`)
  - Type 2: vertical patroller (`my != 0`)
  - Type 3: diagonal patroller (both axes)
  - Type 4: moving platform (player can ride)

- **Movement**: `x += mx`, `y += my`. Bounce at `x1/x2` and `y1/y2` boundaries: negate `mx`/`my`

- **Platform riding** (type 4): if player is within range of the platform vertically and horizontally, set `player.gotten = true`, align `player.y` to platform top, transfer horizontal velocity from platform. Handle edge collision while riding.

- **Damage collision** (`engineDetectCollision`): ±14px bounding box check. On hit:
  - Enter `STATEFLICKER` for 128 frames
  - Knockback: `player.vx = ±(walkVxMax << 1)` (direction away from enemy)
  - `player.lives -= 1`
  - Play hit sound (slot 2) + pain sound (slot 8)

- **Animation frames** (`engineCalcEnemsFrame`): 4-frame cycle at subFrame 4, facing determined by velocity sign. Sprite ID from `spriteMapping` lookup table.

Files created: `src/engine/enemies.ts`, `src/engine/collision.ts`

---

### Phase 10 — Collectibles + win/loss (`step-10`)

- **Hotspot collection**: when player is within ±15px of `hotSpotX/Y`, clear the hotspot and:
  - Type 1 (object): `player.objects++`, play object sound (slot 6)
  - Type 2 (key): `player.keys++`, play key sound (slot 4)
  - Type 3 (extra life): `player.lives += refill`, play life sound (slot 5)
  - Set `hotSpotX/Y = 999` (disable)

- **Win condition**: `player.objects >= maxObjs` (15) → `res = -1`, exit to ending

- **Loss condition**: `player.lives < 0` → `res = -2`, show "GAME OVER", return to title

- **Cheat code**: W+E+R held simultaneously → `player.objects++` (same as original)

- **engineDrawHotSpots**: draw hotspot tile on layer 1 if `hotSpots[nPant].s == true`, using hotspot type → tile index mapping (`objectTile=35`, `keyTile=36`, `lifeTile=34`)

---

### Phase 11 — Ending screen (`step-11`)

Port `showEnding`:
- Load `ENDING.PCX` onto layer 3, copy to layer 1
- Start music (`MC12.S3M`)
- Display ending text letter-by-letter (8×16 font chars) with darken/brighten filter box effect
- Timing: 32-frame initial pause, 8-frame delay per character, 120-frame pause between two text passes
- Wait for keypress → return to main menu
- Complete **full game loop**: Title → Play → Ending → Title

Files created: `src/states/ending.ts`

---

### Phase 12 — Sound via OPL3 emulation + AudioWorklet (`step-12`)

**Overview:** Use `lib/opl3.js` (pure-JS YMF262 emulator) as the OPL3 chip replacement. Run the S3M sequencer and chip together inside an `AudioWorkletProcessor` for zero-latency audio.

**Files:**

| File | Purpose |
|------|---------|
| `lib/opl3.js` | OPL3 chip emulator (external, drop-in) |
| `src/audio/s3m-format.ts` | S3M parser + sequencer (ported from `FMENGINE.BAS`) |
| `src/audio/s3m-worklet.ts` | `AudioWorkletProcessor` — owns OPL3 + S3MFormat, generates samples |
| `src/audio/music-player.ts` | Main-thread controller: loads songs, sends to worklet |
| `src/audio/sound-effects.ts` | WAV playback via standard Web Audio API |

**`s3m-format.ts`** — port of Bisqwit's `FMENGINE.BAS` (879 lines):

1. **S3M binary parsing:**
   - Read header at offset 0x21: `ordnum`, `insnum`, `patnum`
   - Read at 0x32: `effectA` (frames per row), `effectT` (ticks per frame)
   - Read order list from 0x61
   - For each instrument: read 12 OPL3 patch bytes (registers 0x20–0xE3), volume, C4 speed
   - For each pattern: read pointer, seek to offset, read packed pattern data

2. **Sequencer (`update`):**
   - Same logic as `FMtimer` in QB: tick counter, row advancement, pattern loading from disk (in-memory in JS)
   - Each tick: call `FMplayrowfrom` on current pattern position → parse note/instrument/volume/effect → apply to OPL3 channels
   - Support all effects: `A` (set speed), `B` (position jump), `C` (pattern break), `D`/`K` (volume slide), `E`/`F` (pitch slide), `H` (vibrato), `S` (sub-effects: loop/note delay/note cut/pattern delay)
   - `refresh()` returns `fwait` (seconds per tick) for AudioWorklet timing

3. **OPL3 register writes:**
   - `FMwrite(reg, val)` → `this.opl.write(0, reg, val)` instead of `OUT &H388, reg; OUT &H389, val`
   - `FMtouch` → set operator volumes via OPL3
   - `FMupdate` → write all patch bytes + key-on for a channel
   - `FMnoteoff` → clear key-on bit

**`s3m-worklet.ts`** — runs inside `AudioWorkletGlobalScope`:

```ts
import OPL3 from "../lib/opl3";
import { S3MFormat } from "./s3m-format";

class S3MWorkletProcessor extends AudioWorkletProcessor {
  private player: { format: S3MFormat; chunkSize: number } | null = null;

  constructor() {
    super();
    this.port.onmessage = (e) => {
      if (e.data.cmd === "load") {
        const opl = new OPL3();
        const format = new S3MFormat(opl);
        format.load(new Uint8Array(e.data.buffer));
        this.player = { format, chunkSize: 0 };
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    if (!this.player) return true;
    const out = outputs[0]; // [left, right]
    for (let i = 0; i < out[0].length; i++) {
      if (this.player.chunkSize <= 0) {
        this.player.format.update();
        this.player.chunkSize = (sampleRate * this.player.format.refresh()) | 0;
      }
      // Read one stereo frame from OPL3
      (this.player.format as any).opl.read([out[0][i], out[1][i]], 0);
      this.player.chunkSize--;
    }
    return true;
  }
}

registerProcessor("s3m-opl3-processor", S3MWorkletProcessor);
```

**`music-player.ts`** — main thread:

```ts
class MusicPlayer {
  private ctx: AudioContext;
  private worklet: AudioWorkletNode | null = null;

  async init() {
    this.ctx = new AudioContext();
    await this.ctx.audioWorklet.addModule("/js/s3m-worklet.js");
    this.worklet = new AudioWorkletNode(this.ctx, "s3m-opl3-processor");
    this.worklet.connect(this.ctx.destination);
  }

  loadSong(url: string) {
    fetch(url).then(r => r.arrayBuffer()).then(buf => {
      this.worklet!.port.postMessage({ cmd: "load", buffer: buf }, [buf]);
    });
  }

  stop() { this.ctx.close(); }
}
```

**`sound-effects.ts`** — separate from OPL3:

```ts
class SoundEffects {
  private ctx: AudioContext;
  private slots: AudioBuffer[] = [];

  async load(slot: number, url: string) { /* decodeAudioData, store in slots[slot] */ }
  play(slot: number, loop: boolean) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.slots[slot];
    src.loop = loop;
    src.playbackRate.value = freq / 11025; // pitch shifting
    src.connect(this.ctx.destination);
    src.start();
  }
  stopVoice(voice: number) { /* stop specific source */ }
}
```

**PlaySound frequency mapping:**
- `DQBplaySound(slot, voice, freq, loop)` → `playbackRate = freq / 11025` (original Sound Blaster sample rate)

**Game integration:**
- `FMload("MUSIC/foo.S3M")` → `musicPlayer.loadSong("/MUSIC/foo.S3M")`
- `FMplayeffect(idx)` → load specific row from `EFFECTS.S3M` pattern bank
- `BeSilent()` → write 0 to all OPL3 registers
- `DQBplaySound(n, voice, freq, loop)` → `sfx.play(n, loop)` with pitch

---

### Phase 13 — Polish (`step-13`)

- **Canvas scaling**: render at 320×200, CSS scale to fit window maintaining aspect ratio, `image-rendering: pixelated` for crisp pixels
- **Palette fade effects**: `fadeTo(r,g,b)` → interpolate palette over N frames. `fadeIn(pal)` → ramp from black to full palette
- **Blender map effects**: `LALA.BMA` for darken (color 255) and brighten (color 254). `filterBox` applies LUT: `result = bma[fg * 256 + col]`
- **Frame rate**: lock to 60fps via RAF; skip update if tab is hidden (`document.hidden`)
- **Browser tab visibility**: pause game when hidden, resume when visible (`visibilitychange` event)
- **Error handling**: graceful fallback if audio context fails to init (mute music, continue playing)
- **Window focus**: pause when window loses focus (optional)

---

## Key technical notes

| Concept | Original (QB) | Port (TS) |
|---------|---------------|-----------|
| Screen mode | 320×200×256 VGA (mode 13h) | Canvas 2D, 320×200 ImageData, scaled via CSS |
| Color | 8-bit indexed palette (768 bytes) | RGBA Uint32Array lookup table from palette |
| Layers | EMS-based (up to 10) | Offscreen canvases or ImageData buffers |
| Transparency | Skip color index 0 during blit | Skip RGBA pixel where index was 0 |
| Fixed-point | `x << 6` (16.6 format) | `number` (keep same arithmetic, no performance concern) |
| Collision | 22×14 letterboxed buffer | Same buffer layout; `cToIdx = 1 + x + (y+1) * 22` |
| Tile size | 16×16 pixels | Same |
| Sprite size | 24×24 pixels | Same |
| Keyboard | INT 9h ISR, scancode-based | `keydown`/`keyup` events, scancode map |
| Sound FX | Sound Blaster DMA, 32 voices | Web Audio API, AudioBufferSourceNode |
| Music | OPL3/AdLib via port I/O (0x388) | `lib/opl3.js` chip emulation + ported S3M player in AudioWorklet |
| Timing | `DQBwait(1)` = VSync (60fps) | `requestAnimationFrame` with counter |
| Datafiles | PCX, binary MAP, TXT | Fetch → typed arrays → parsed in TS |
| S3M format | Read from disk per row (QB memory limit) | Load entire file into memory, no on-demand disk I/O needed |
