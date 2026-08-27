# LaLa JS

A TypeScript/browser port of **LaLa Prologue**, a DOS QuickBasic 4.5 platformer by [The Mojon Twins](https://www.mojontwins.com).

## About the Original Game

**LaLa Prologue** (2012) is a side-scrolling platformer built in Microsoft QuickBasic 4.5 using the [DirectQB](http://ec.neozones.com) library and [Bisqwit's fmEngine](https://bisqwit.iki.fi/source/fmengineqb.html) for Adlib music.

You play as Lala, a young witch-in-training who accidentally scattered all of Mistress Morgana's magical potions across the decrepit surroundings of the academy. Collect 15 potions to complete the mission, using keys to unlock gates and avoiding enemies patrolling the cemetery and ruined churches.

| | |
|---|---|
| **Original** | MS-DOS, QuickBasic 4.5 (2012) |
| **Resolution** | 320x200, 256 colors (VGA Mode 13h) |
| **Map** | 6x6 grid of 20x12 tile screens |
| **Genre** | Action-platformer with light puzzle elements |

## This Port

Rewrites the QB engine in TypeScript targeting the browser's Canvas 2D API, with:

- **320x200 indexed-color rendering** — 4 virtual layers, palette LUT blitting, `image-rendering: pixelated` CSS scaling
- **Original asset formats** — PCX images, DirectQB FNT fonts, MAP/TXT data files loaded at runtime (no build-time asset conversion)
- **FM music via OGG** — S3M modules pre-rendered to OGG via `adplay` + `ffmpeg`; played through `HTMLAudioElement`
- **Web Audio SFX** — 10 original 11025 Hz WAVs decoded and played per-slot with per-voice volume control
- **Full player physics** — fixed-point (1/64 px) gravity, jumping, friction, tile collision, edge detection
- **Enemy AI** — patrol bouncing, platform riding (velocity transfer), damage collision with knockback
- **Collectibles** — potions, keys, extra lives with pickup SFX
- **Game states** — title screen with mode selection, gameplay, ending screen with typewriter text
- **Global speed control** — fractional accumulator decouples physics tick rate from display refresh rate
- **Dual rendering engines** — choose between original flip-screen or new smooth-scrolling mode (see below)

## Quick Start

```bash
npm install
npm run dev
```

Open the URL shown by Vite (typically `http://localhost:5173`).

## Build

```bash
npm run build    # TypeScript check + Vite production build
npm run lint     # ESLint
```

Output goes to `dist/`.

## Project Structure

```
lala-js/
├── public/
│   ├── GFX/          # PCX images, FNT font, TXT data
│   ├── MAP/          # Level data (LALA.MAP, TILEPROP.TXT, ENEMS.TXT, etc.)
│   ├── MUSIC/        # OGG music (converted from S3M)
│   └── SFX/          # WAV sound effects (8-bit 11025 Hz mono)
├── src/
│   ├── main.ts               # Entry point, game loop orchestration
│   ├── screen.ts             # Virtual VGA: layers, palette, blitter
│   ├── keyboard.ts           # Scancode-based keyboard input
│   ├── engine/
│   │   ├── config.ts         # Runtime config (game speed, scroll toggle)
│   │   ├── game-loop.ts      # Flip-screen game loop (engineDoGame)
│   │   ├── player.ts         # Player physics + tile collision (flip-screen)
│   │   ├── enemies.ts        # Enemy AI + platform riding (flip-screen)
│   │   ├── collision.ts      # AABB collision + keyhole detection
│   │   ├── render.ts         # Layer drawing, stats, hotspot rendering
│   │   ├── map.ts            # Screen/tile preparation from level data
│   │   ├── types.ts          # TypeScript interfaces matching QB TYPEs
│   │   ├── prefs.ts          # Game constants (gravity, speeds, etc.)
│   │   ├── scroll-types.ts   # World buffer, camera, enemy/hotspot conversion
│   │   ├── scroll-camera.ts  # Camera tracking for scrolling engine
│   │   ├── scroll-render.ts  # Tile/sprite rendering with camera offset
│   │   ├── scroll-player.ts  # Player physics (scrolling engine)
│   │   ├── scroll-enemies.ts # Enemy AI (scrolling engine)
│   │   └── scroll-game-loop.ts # Scrolling game loop (scrollDoGame)
│   ├── assets/               # Loaders: PCX, FNT, MAP, TXT, WAV
│   ├── audio/
│   │   ├── music-player.ts   # OGG music playback (HTMLAudioElement)
│   │   └── sound-effects.ts  # WAV SFX (Web Audio API, per-voice volume)
│   └── states/
│       ├── title.ts          # Title screen with mode selection
│       └── ending.ts         # Ending screen
└── PORTING_PLAN.md           # Detailed porting plan
```

## Controls

| Key | Action |
|---|---|
| ←/→ | Walk |
| Ctrl / ↑ | Jump |
| W+E+R | Cheat (+1 potion) |
| Escape | Quit to title |

## Rendering Modes

The title screen lets you choose between two rendering engines. Use ←/→ to toggle, then press Enter to start.

### Flip-Screen (original)

The original game's engine. The map is a 6×6 grid of 20×12 tile screens. Walking off the edge transitions to the adjacent screen. Each screen is loaded and rendered independently.

### Scrolling

A new smooth-scrolling engine built for this port. The entire 120×72 tile map is loaded into a single world buffer. The camera follows the player with pixel-smooth scrolling. Features:

- Full-map world buffer with layered tile rendering (background + foreground)
- Camera with smooth sub-tile tracking
- World-absolute enemy patrol paths spanning multiple screens
- Backdrop image drawn behind the tile layers
- Hotspot and enemy positions translated to world coordinates

## Credits

| Role | Person |
|---|---|
| Game | [The Mojon Twins](https://www.mojontwins.com) — na_th_an, anjuel, kendroock |
| fmEngineQB | [Joel Yliluoma (Bisqwit)](https://bisqwit.iki.fi/source/fmengineqb.html) |
| DirectQB | Angelo Mottola (Enhanced Creations) |
| TypeScript port | See git history |

## License

Original game: freeware (GPLv3 per source). This port preserves the original assets under their original license.
