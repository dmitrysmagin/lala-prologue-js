/** Phase 7 — Core game loop (engineDoGame) */
import { Screen, VIDEO, LAYER_1, LAYER_2, LAYER_3 } from "../screen";
import { Keyboard, SC_ENTER, SC_W, SC_E, SC_R } from "../keyboard";
import type { TypePrefs, TypePlayer, TypeTileLayers, TypeHotSpots, TypeEnems } from "./types";
import { createCurScreenBuff } from "./types";
import { engineScreenPrepare } from "./map";
import { engineScreenDrawLayer1, engineScreenDrawLayer2, engineDrawHotSpots, enginePrintStats, engineRprint } from "./render";
import { engineMovePlayer, type PlaySfx, type StopSfx } from "./player";
import { engineMoveEnems } from "./enemies";
import { PCXLoader } from "../assets/PCXLoader";
import { config } from "./config";

export type { PlaySfx, StopSfx } from "./player";

/**
 * Result codes mirroring QB engineDoGame% return:
 *  0  = exit via ESC/Enter (title), -1 = win (maxObjs), -2 = loss (lives<0), -3 = Enter in title mode
 */
export type EngineDoGameResult = -3 | -2 | -1 | 0;

export interface EngineDoGameOpts {
  screen: Screen;
  keyboard: Keyboard;
  prefs: TypePrefs;
  tileProperties: { location: number; flags: number }[];
  spriteProperties: { offX: number; offY: number }[];
  spriteMapping: number[];
  tileset: { width: number; height: number; data: Uint8Array; palette: Uint8Array | null };
  spriteset: { width: number; height: number; data: Uint8Array; palette: Uint8Array | null };
  map: Uint8Array;
  enems: TypeEnems[][];
  hotSpots: TypeHotSpots[];
  player: TypePlayer;
  curScreenBuff?: TypeTileLayers[];
  nPantInit?: number;
  /** flag: 0 = title demo (blinks PRESS ENTER), 1 = real game */
  flag: 0 | 1;
  /** Optional backdrop PCX (320×200/192). If not provided, loads from /GFX/BACKDROP.PCX */
  backdrop?: { width: number; height: number; data: Uint8Array } | null;
  /** Optional SFX callback — wired from SoundEffects in main.ts */
  playSfx?: PlaySfx;
  /** Optional SFX stop callback — for stopping ambient loops on exit */
  stopSfx?: StopSfx;
  /** Frame budget: RAF, but expose for tests */
  onFrame?: (state: { nPant: number; frame: number; player: TypePlayer }) => void;
}

async function loadBackdrop(prefs: TypePrefs): Promise<{ width: number; height: number; data: Uint8Array } | null> {
  try {
    const r = await fetch(`/GFX/${prefs.backdropFile}`);
    if (!r.ok) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    const img = new PCXLoader().load(bytes);
    return { width: img.width, height: img.height, data: img.data };
  } catch {
    return null;
  }
}

function blitBackdropToLayer(screen: Screen, layer: number, backdrop: { width: number; height: number; data: Uint8Array }, atY: number) {
  const lut = screen.getPaletteLut(); // ensure palette already set before calling
  void lut;
  const dstIdx = screen.getLayerIndices(layer);
  const dstU32 = screen.getLayerU32(layer);
  const curLut = screen.getPaletteLut();
  const bw = backdrop.width, bh = backdrop.height;
  const src = backdrop.data;
  for (let y = 0; y < bh; y++) {
    const py = atY + y;
    if (py < 0 || py >= 200) continue;
    const dRow = py * 320;
    const sRow = y * bw;
    for (let x = 0; x < bw && x < 320; x++) {
      const pal = src[sRow + x];
      const di = dRow + x;
      dstIdx[di] = pal;
      dstU32[di] = curLut[pal];
    }
  }
}

/**
 * Port of ENGINE.BAS:engineDoGame — frame loop via requestAnimationFrame.
 * For Phase 7, player/enemy movement is stubbed (no physics yet), but
 * screen preparation, layer rendering, backdrop, hotspots, stats, transitions,
 * cheat, and win/loss checks are implemented.
 */
export async function engineDoGame(opts: EngineDoGameOpts): Promise<EngineDoGameResult> {
  const { screen, keyboard, prefs, tileProperties, spriteProperties, spriteMapping, tileset, spriteset, enems, hotSpots, player } = opts;
  const flag = opts.flag;
  const playSfx: PlaySfx = opts.playSfx ?? (() => {});
  const stopSfx: StopSfx = opts.stopSfx ?? (() => {});
  const curScreenBuff = opts.curScreenBuff ?? createCurScreenBuff();

  const hotSpotsTiles: number[] = [];
  hotSpotsTiles[1] = prefs.objectTile;
  hotSpotsTiles[2] = prefs.keyTile;
  hotSpotsTiles[3] = prefs.lifeTile;

  const lastRow = (prefs.mapH - 1) * prefs.mapW;
  const lastPant = prefs.mapH * prefs.mapW - 1;

  let nPant: number;
  if (flag) nPant = opts.nPantInit ?? prefs.iniPant;
  else nPant = prefs.mapW * (prefs.mapH - 1); // title start pant per QB

  const map = opts.map;
  engineScreenPrepare(nPant, tileProperties as any, map, curScreenBuff, prefs, hotSpots);

  // Backdrop: DQBclearLayer 3 + DQBloadImage backdrop → then DQBcopyLayer 3,2 + drawLayer1
  const backdrop = opts.backdrop ?? await loadBackdrop(prefs);
  screen.clearLayer(LAYER_3);
  if (backdrop) blitBackdropToLayer(screen, LAYER_3, backdrop, prefs.screenPos.y);
  else screen.clearLayer(LAYER_3); // black

  if (flag) {
    // In flag=1 the original does not re-clear LAYER_3 per loop; we do initial copy
  }

  // Prepare background for first frame
  screen.copyLayer(LAYER_3, LAYER_2);
  engineScreenDrawLayer1(screen, tileset as any, prefs, curScreenBuff, LAYER_2);

  let frame = 0;
  let subFrame = 0;
  let logicAccum = 0;   // fractional accumulator — physics fires when >= 1.0
  let flickerFrame = 0;

  // Ensure player position matches iniTX/TY if flag
  if (flag) {
    // engineInitPlayer already called by caller; keep as is
  } else {
    // Title mode — player not used for physics, but keep visible? Original title mode still calls engineDoGame with flag=0
    // which shows prompt instead of stats.
  }

  let res: EngineDoGameResult | null = null;
  let running = true;

  // Start ambient loops (QB: DQBplaySound prefs.bgL1,5,11025,LOOPED / bgL2,6,11025,LOOPED)
  if (flag) {
    if (prefs.bgL1) playSfx(prefs.bgL1, true);
    if (prefs.bgL2) playSfx(prefs.bgL2, true);
  }

  // DQBwait simulation: RAF throttles to 60fps
  const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

  while (running) {
    // --- Frame pacing ---
    await nextFrame();
    flickerFrame++;
    logicAccum += config.gameSpeed;
    const tickNow = logicAccum >= 1.0;
    if (tickNow) logicAccum -= 1.0; // consume one tick worth, keep remainder

    // Layer2 animation — advances when physics ticks
    if (tickNow) {
      subFrame = (subFrame + 1) & 3;
      if (subFrame === 0) { frame = (frame + 1) & 3; if (frame === 4) frame = 0; }
    }

    // --- Player physics (Phase 8) — every physics tick ---
    if (flag && !player.gameOver && tickNow) {
      engineMovePlayer(keyboard, curScreenBuff, player, prefs, map, playSfx);
    }

    // --- Enemy AI + platform riding + collision (Phase 9) ---
    if (flag && tickNow) {
      engineMoveEnems(enems, curScreenBuff, prefs, player, nPant, playSfx);
    }

    // --- Screen transition ---
    if (player.attempt && flag) {
      switch (player.attempt) {
        case 1: // DLEFT
          if (nPant > 0) { nPant--; player.x = (prefs.screenW - 1) << 10; }
          break;
        case 2: // DRIGHT
          if (nPant < lastPant) { nPant++; player.x = 0; }
          break;
        case 3: // DUP
          if (nPant >= prefs.mapW) { nPant -= prefs.mapW; player.y = (prefs.screenH - 1) << 10; }
          break;
        case 4: // DDOWN
          if (nPant < lastRow) { nPant += prefs.mapW; player.y = 0; }
          break;
      }
      if (map) engineScreenPrepare(nPant, tileProperties as any, map, curScreenBuff, prefs, hotSpots);
      screen.copyLayer(LAYER_3, LAYER_2);
      engineScreenDrawLayer1(screen, tileset as any, prefs, curScreenBuff, LAYER_2);
      player.attempt = 0;
    }

    // --- Hotspot collection (Phase 10) + SFX (Phase 12) ---
    if (flag && map) {
      const x = player.x >> 6;
      const y = player.y >> 6;
      if (x >= prefs.hotSpotX - 15 && x <= prefs.hotSpotX + 15 && y >= prefs.hotSpotY - 15 && y <= prefs.hotSpotY + 15) {
        const hs = hotSpots[nPant];
        if (hs && hs.s) {
          hs.s = false;
          if (hs.t === 1) { player.objects++; playSfx(6); }       // OBJECT (slot 6)
          else if (hs.t === 2) { player.keys++; playSfx(4); }    // KEY (slot 4)
          else if (hs.t === 3) { player.lives += prefs.refill; playSfx(5); } // LIFE (slot 5)
          prefs.hotSpotX = 999; prefs.hotSpotY = 999;
        }
      }
    }

    // --- Animation frames (ENGINE.BAS:35-53) — synced with game logic ---
    if (flag && tickNow && player && spriteMapping.length > 0) {
      // Player frame calculation
      if (player.vy < 0) {
        // Jumping up
        player.sprId = spriteMapping[player.facing + 4] ?? player.sprId;
      } else if (player.vy > 0) {
        // Falling
        player.sprId = spriteMapping[player.facing + 5] ?? player.sprId;
      } else if (player.vx !== 0) {
        // Walking — cycle frames
        player.sprId = spriteMapping[player.facing + player.frame] ?? player.sprId;
        player.subFrame = (player.subFrame + 1) & 3;
        if (player.subFrame === 0) {
          player.frame = (player.frame + 1) & 3;
        }
      } else {
        // Standing still
        player.sprId = spriteMapping[player.facing] ?? player.sprId;
      }
    }
    // Enemy frame calculation (ENGINE.BAS:20-33)
    if (tickNow) {
      for (let i = 0; i < prefs.nEnems; i++) {
        const e = enems[nPant]?.[i];
        if (!e || e.t === 0) continue;
        e.subFrame = (e.subFrame + 1) & 3;
        if (e.subFrame === 0) e.frame = (e.frame + 1) & 3;
        e.facing = (e.mx + e.my > 0) ? 0 : 4;
        const sid = 12 + ((e.t - 1) << 3) + e.facing + e.frame;
        if (sid < spriteMapping.length) e.sprId = spriteMapping[sid] ?? e.sprId;
      }
    }

    // --- Render ---
    // QB: DQBcopyLayer 2,1 → draw player → draw enems → draw layer2 → draw hotspots → stats → DQBcopyLayer 1,VIDEO
    screen.copyLayer(LAYER_2, LAYER_1);
    if (!player.gameOver) {
      const px = player.x >> 6;
      const py = player.y >> 6;
      // Flicker state: blink using dedicated frame counter (~7.5 Hz)
      const showPlayer = player.state === 0 || (flickerFrame & 4) === 0;
      if (showPlayer) {
        const sid = player.sprId;
        const off = spriteProperties[sid] ?? { offX: 0, offY: 0 };
        screen.blitSprite(LAYER_1, spriteset as any, sid, prefs.screenPos.x + px - off.offX, prefs.screenPos.y + py - off.offY);
      }
    }
    for (let i = 0; i < prefs.nEnems; i++) {
      const e = enems[nPant]?.[i];
      if (!e || e.t === 0) continue;
      const sid = e.sprId;
      const off = spriteProperties[sid] ?? { offX: 0, offY: 0 };
      screen.blitSprite(LAYER_1, spriteset as any, sid, prefs.screenPos.x + e.x - off.offX, prefs.screenPos.y + e.y - off.offY);
    }
    engineScreenDrawLayer2(screen, tileset as any, prefs, curScreenBuff, frame, LAYER_1);
    engineDrawHotSpots(screen, nPant, tileset as any, prefs, hotSpots, hotSpotsTiles as unknown as number[], LAYER_1);

    if (flag) {
      enginePrintStats(screen, player, prefs, tileset as any);
    } else {
      // Title mode prompt — like showTitle's "PRESS ENTER TO PLAY" / "GAME OVER"
      if (player.gameOver) {
        screen.filterBox(LAYER_1, 116, 92, 203, 107, 255, await getBma());
        engineRprint(screen, LAYER_1, "GAME OVER", 123, 95);
      } else {
        if ((frame & 16) === 0) {
          // Blink box
          screen.filterBox(LAYER_1, 80, 136, 239, 151, 255, await getBma());
          engineRprint(screen, LAYER_1, "PRESS ENTER TO PLAY", 89, 141);
        }
      }
    }

    // DQBwait(1) + DQBcopyLayer 1,VIDEO
    screen.copyLayer(LAYER_1, VIDEO);
    screen.present();
    opts.onFrame?.({ nPant, frame, player });

    // --- Cheat W+E+R ---
    if (keyboard.isDown(SC_W) && keyboard.isDown(SC_E) && keyboard.isDown(SC_R)) {
      // Debounce by waiting release (like QB WHILE DQBkey...)
      // For Phase 7 just increment and clear to avoid spam
      player.objects++;
      keyboard.clear();
      await new Promise<void>((r) => setTimeout(r, 200));
    }

    // --- Win/Loss ---
    if (flag) {
      if (player.objects >= prefs.maxObjs) { res = -1; running = false; }
      else if (player.lives < 0) { res = -2; player.gameOver = -1; }
    }

    // --- Exit via ESC/Enter ---
    // Original loops WHILE NOT DQBkey(1) (ESC scancode 1); Phase 6 uses Enter to start game.
    // For flag=0, Enter → -3 to signal "start real game"
    if (!flag && keyboard.isDown(SC_ENTER)) { res = -3; running = false; }
    if (keyboard.isDown(0x01)) { // Escape
      res = 0 as EngineDoGameResult;
      running = false;
    }

    // Title mode blinking done via render; no extra wait
  }

  // Cleanup: stop ambient loops (voices 5 and 6)
  if (flag) {
    if (prefs.bgL1) stopSfx(5);
    if (prefs.bgL2) stopSfx(6);
  }
  return res ?? 0;
}

let _bmaCache: Uint8Array | null = null;
async function getBma(): Promise<Uint8Array> {
  if (_bmaCache) return _bmaCache;
  try {
    const r = await fetch("/GFX/LALA.BMA");
    if (r.ok) {
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.length >= 65536) { _bmaCache = buf; return buf; }
      if (buf.length === 512 || buf.length === 768) { /* wrong */ }
    }
  } catch { /* ignore */ }
  // Mock darken
  const bma = new Uint8Array(65536);
  for (let fg = 0; fg < 256; fg++) for (let bg = 0; bg < 256; bg++) bma[(fg << 8) | bg] = bg === 255 ? (fg * 0.6) | 0 : fg;
  _bmaCache = bma;
  return bma;
}
