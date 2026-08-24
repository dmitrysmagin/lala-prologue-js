/**
 * Phase 12 — Sound effects (WAV via Web Audio) — STUB for now.
 *
 * NOTE 2026-08-24: EFFECTS.S3M is NOT a replayable music module.
 *   It contains 0 patterns, ordNum=0, insNum=4, patNum=0 — only
 *   OPL3 FM instruments intended to be triggered per-event via
 *   FMplayeffect(idx) (see FMENGINE.BAS:267). The game never actually
 *   calls FMplayeffect; all audible SFX go through DirectQB's
 *   DQBplaySound slots loading 8-bit 11025 Hz mono WAVs from SFX/*.WAV.
 *   The disk-rendered EFFECTS.wav is therefore ~2 KB of silence.
 *   We keep SFX stubbed (no audible playback) until replacement
 *   assets are sourced. See src/audio/SFX_CATALOG.md for full audit.
 *
 * Original slot → file mapping (LALA.BAS:47-56):
 *   1 BOLT.WAV, 2 HIT.WAV, 3 JUMP.WAV, 4 KEY.WAV, 5 LIFE.WAV,
 *   6 OBJECT.WAV, 7 PINCHE.WAV, 8 AH.WAV, 9 AMBIENT1.WAV, 10 AMBIENT2.WAV
 *
 * For later replacement, search CC0 alternatives matching duration/character
 * described in SFX_CATALOG.md (e.g. freesound.org, opengameart.org).
 * @see src/audio/SFX_CATALOG.md
 */

/** Semantic SFX identifiers — mirrors original DQB slot numbers */
export const SFX_SLOT = {
  BOLT: 1,
  HIT: 2,
  JUMP: 3,
  KEY: 4,
  LIFE: 5,
  OBJECT: 6,
  PINCHE: 7,
  AH: 8,
  AMBIENT1: 9,
  AMBIENT2: 10,
} as const;

export type SfxSlot = typeof SFX_SLOT[keyof typeof SFX_SLOT];

export interface SfxEntry {
  slot: SfxSlot;
  file: string;        // original file under public/SFX/
  event: string;       // player-visible occasion
  voice: number;       // DQB voice (1..6)
  freq: number | string; // 11025 or "11025+RND*1024"
  loop: "ONCE" | "LOOPED";
  qbLocation: string;  // ENGINE.BAS / LALA.BAS line
  notes: string;
}

/**
 * Exhaustive catalog of all SFX trigger sites in the original QB code.
 * Keep in sync with SFX_CATALOG.md. Used by the stub logger.
 */
export const SFX_CATALOG: SfxEntry[] = [
  {
    slot: SFX_SLOT.BOLT, file: "SFX/BOLT.WAV", event: "Keyhole unlock (bolt)",
    voice: 2, freq: 11025, loop: "ONCE",
    qbLocation: "ENGINE.BAS:678 DQBplaySound 1,2,11025,ONCE // engineDetectKeyHole",
    notes: "Metallic bolt/lock click ~0.42s. Trigger: standing on tile boundary with keys and pressing left/right into behaviour==10 tile.",
  },
  {
    slot: SFX_SLOT.HIT, file: "SFX/HIT.WAV", event: "Enemy collision hit",
    voice: 4, freq: 11025, loop: "ONCE",
    qbLocation: "ENGINE.BAS:539 DQBplaySound 2,4,11025,ONCE // engineMoveEnems enemy hit",
    notes: "Short thud/hit ~0.35s. Trigger: AABB ±14px player vs enemy (non-platform). Always paired with AH on voice 3.",
  },
  {
    slot: SFX_SLOT.JUMP, file: "SFX/JUMP.WAV", event: "Player jump",
    voice: 1, freq: "11025+RND*1024", loop: "ONCE",
    qbLocation: "ENGINE.BAS:602 DQBplaySound 3,1,11025+RND*1024,ONCE // engineMovePlayer",
    notes: "Pop/jump ~0.27s with slight pitch randomisation. Trigger: Ctrl or Up while grounded. Good CC0 replacement: 8-bit jump blip.",
  },
  {
    slot: SFX_SLOT.KEY, file: "SFX/KEY.WAV", event: "Key pickup (hotspot t==2)",
    voice: 4, freq: 11025, loop: "ONCE",
    qbLocation: "ENGINE.BAS:175 DQBplaySound 4,4,11025,ONCE",
    notes: "Chime ~0.42s. Trigger: player within ±15px of hotspot t=2.",
  },
  {
    slot: SFX_SLOT.LIFE, file: "SFX/LIFE.WAV", event: "Extra life pickup (hotspot t==3)",
    voice: 4, freq: 11025, loop: "ONCE",
    qbLocation: "ENGINE.BAS:178 DQBplaySound 5,4,11025,ONCE",
    notes: "Upbeat jingle ~0.80s. Trigger: hotspot t=3, adds prefs.refill (1) lives.",
  },
  {
    slot: SFX_SLOT.OBJECT, file: "SFX/OBJECT.WAV", event: "Object/potion pickup (hotspot t==1)",
    voice: 4, freq: 11025, loop: "ONCE",
    qbLocation: "ENGINE.BAS:172 DQBplaySound 6,4,11025,ONCE",
    notes: "Collect shimmer ~0.80s. Hotspot t=1, increments player.objects towards maxObjs=15 win.",
  },
  {
    slot: SFX_SLOT.PINCHE, file: "SFX/PINCHE.WAV", event: "Evil/spike tile damage",
    voice: 4, freq: 11025, loop: "ONCE",
    qbLocation: "ENGINE.BAS:685 DQBplaySound 7,4,11025,ONCE // behaviour==1 tile",
    notes: "Sharp pinche ~0.27s. Trigger: standing on behaviour==1 tile. Paired with AH.",
  },
  {
    slot: SFX_SLOT.AH, file: "SFX/AH.WAV", event: "Pain vocal (damage)",
    voice: 3, freq: "11025 / 11025+RND*1024", loop: "ONCE",
    qbLocation: "ENGINE.BAS:540 DQBplaySound 8,3,11025,ONCE and 687 DQBplaySound 8,3,11025+RND*1024 // enemy & evil tile",
    notes: "Vocal 'ah' ~0.34s. Trigger: enemy collision or evil tile while STATENORMAL. Enters STATEFLICKER 128 frames.",
  },
  {
    slot: SFX_SLOT.AMBIENT1, file: "SFX/AMBIENT1.WAV", event: "Ambient loop L1 (background drone)",
    voice: 5, freq: 11025, loop: "LOOPED",
    qbLocation: "ENGINE.BAS:115 DQBplaySound prefs.bgL1(9),5,11025,LOOPED and 236 DQBstopVoice 5",
    notes: "Looping cave/wind bed ~4.67s loop. Started on flag==1, stopped on engineDoGame exit. Replace with seamless loop.",
  },
  {
    slot: SFX_SLOT.AMBIENT2, file: "SFX/AMBIENT2.WAV", event: "Ambient loop L2 (background texture)",
    voice: 6, freq: 11025, loop: "LOOPED",
    qbLocation: "ENGINE.BAS:116 DQBplaySound prefs.bgL2(10),6,11025,LOOPED and 237 DQBstopVoice 6",
    notes: "Looping texture ~5.81s. Second layer over AMBIENT1. Both can be crossfaded per-screen in future.",
  },
];

/** Map slot → entry for quick lookup */
const CATALOG_BY_SLOT = new Map<number, SfxEntry>(SFX_CATALOG.map(e => [e.slot, e]));

/**
 * Minimal stub — preserves Web Audio API shape but does NOT produce audible
 * output by default (muted). Set `stubAudible = true` to re-enable for debugging.
 * All play() calls are logged to console so future implementation can verify triggers.
 */
export class SoundEffects {
  private ctx: AudioContext | null = null;
  private buffers = new Map<number, AudioBuffer>();
  private stubAudible = false; // flip to true to actually hear original WAVs during dev

  async init(): Promise<void> {
    if (this.stubAudible) {
      try {
        this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      } catch { this.ctx = null; }
    } else {
      // Stub: no AudioContext — avoids autoplay/suspend warnings
      this.ctx = null;
      console.info("[sfx] SoundEffects stub active — playback muted. See SFX_CATALOG.md for replacement task.");
    }
  }

  /** Load WAV into slot (no-op when stubAudible==false, logs intention). */
  async load(slot: number, url: string): Promise<void> {
    const entry = CATALOG_BY_SLOT.get(slot);
    const label = entry ? `${entry.event} (${entry.file})` : `slot ${slot}`;
    if (!this.stubAudible || !this.ctx) {
      console.debug(`[sfx] stub load: ${label} <- ${url}`);
      return;
    }
    try {
      const r = await fetch(url);
      if (!r.ok) { console.warn(`[sfx] load ${label} HTTP ${r.status}`); return; }
      const ab = await r.arrayBuffer();
      const buf = await this.ctx.decodeAudioData(ab);
      this.buffers.set(slot, buf);
      console.debug(`[sfx] loaded ${label} ${buf.duration.toFixed(2)}s`);
    } catch (e) { console.warn(`[sfx] load ${label} failed`, e); }
  }

  /** Convenience: load all original WAVs (still stubbed unless audible enabled) */
  async loadAll(base = "/SFX"): Promise<void> {
    for (const e of SFX_CATALOG) await this.load(e.slot, `${base}/${e.file.split("/")[1]}`);
  }

  /** Stub play — logs catalog entry, optionally plays if audible + buffer present */
  play(slot: number, _loop = false, _freq = 11025): void {
    const entry = CATALOG_BY_SLOT.get(slot);
    const label = entry ? `${entry.event} [slot ${slot}]` : `slot ${slot}`;
    console.debug(`[sfx] stub play: ${label} loop=${_loop} freq=${_freq}`);
    if (!this.stubAudible || !this.ctx) return;
    const buf = this.buffers.get(slot);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = _loop;
    src.playbackRate.value = _freq / 11025;
    src.connect(this.ctx.destination);
    src.start();
  }

  /** Semantic helper — play by SFX_SLOT key */
  playByName(name: keyof typeof SFX_SLOT, loop = false, freq = 11025): void {
    this.play(SFX_SLOT[name], loop, freq);
  }

  stopVoice(_voice: number): void {
    console.debug(`[sfx] stub stopVoice ${_voice}`);
    // Real impl would track per-voice sources and stop them
  }

  /** Enable audible playback for debugging original assets */
  setAudible(v: boolean): void { this.stubAudible = v; if (v && !this.ctx) this.init(); }
  isStub(): boolean { return !this.stubAudible; }

  /** Expose catalog for UI / docs tooling */
  static catalog(): readonly SfxEntry[] { return SFX_CATALOG; }
  static entry(slot: number): SfxEntry | undefined { return CATALOG_BY_SLOT.get(slot); }
}
