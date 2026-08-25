/**
 * Phase 12 — Sound effects (WAV via Web Audio API)
 *
 * Loads all 10 original 8-bit 11025 Hz mono WAVs and plays them through
 * the browser's Web Audio API. AudioContext is created lazily on first
 * user gesture (same pattern as MusicPlayer).
 *
 * Slot mapping (LALA.BAS:47-56):
 *   1 BOLT.WAV      2 HIT.WAV       3 JUMP.WAV      4 KEY.WAV
 *   5 LIFE.WAV      6 OBJECT.WAV    7 PINCHE.WAV    8 AH.WAV
 *   9 AMBIENT1.WAV 10 AMBIENT2.WAV
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
  file: string;
  event: string;
  voice: number;
  freq: number;
  loop: boolean;
  volume: number; // 0.0–1.0, default 0.75
  notes: string;
}

export const SFX_CATALOG: SfxEntry[] = [
  { slot: 1,  file: "SFX/BOLT.WAV",     event: "Keyhole unlock",    voice: 2, freq: 11025, loop: false, volume: 0.75, notes: "Metallic bolt click" },
  { slot: 2,  file: "SFX/HIT.WAV",      event: "Enemy collision",   voice: 4, freq: 11025, loop: false, volume: 0.75, notes: "Short thud" },
  { slot: 3,  file: "SFX/JUMP.WAV",     event: "Player jump",       voice: 1, freq: 11025, loop: false, volume: 0.75, notes: "Pop/jump with pitch randomisation" },
  { slot: 4,  file: "SFX/KEY.WAV",      event: "Key pickup",        voice: 4, freq: 11025, loop: false, volume: 0.75, notes: "Chime" },
  { slot: 5,  file: "SFX/LIFE.WAV",     event: "Extra life",        voice: 4, freq: 11025, loop: false, volume: 0.75, notes: "Upbeat jingle" },
  { slot: 6,  file: "SFX/OBJECT.WAV",   event: "Object pickup",     voice: 4, freq: 11025, loop: false, volume: 0.75, notes: "Collect shimmer" },
  { slot: 7,  file: "SFX/PINCHE.WAV",   event: "Evil tile damage",  voice: 4, freq: 11025, loop: false, volume: 0.75, notes: "Sharp pinche" },
  { slot: 8,  file: "SFX/AH.WAV",       event: "Pain vocal",        voice: 3, freq: 11025, loop: false, volume: 0.75, notes: "Vocal ah" },
  { slot: 9,  file: "SFX/AMBIENT1.WAV", event: "Ambient loop L1",   voice: 5, freq: 11025, loop: true,  volume: 0.05, notes: "Cave/wind drone" },
  { slot: 10, file: "SFX/AMBIENT2.WAV", event: "Ambient loop L2",   voice: 6, freq: 11025, loop: true,  volume: 0.05, notes: "Texture loop" },
];

const CATALOG_BY_SLOT = new Map<number, SfxEntry>(SFX_CATALOG.map(e => [e.slot, e]));

export class SoundEffects {
  private ctx: AudioContext | null = null;
  private buffers = new Map<number, AudioBuffer>();
  /** Per-voice GainNode for independent volume control */
  private voiceGains = new Map<number, GainNode>();
  /** Track active sources per voice (1-6) for stopVoice */
  private activeByVoice = new Map<number, AudioBufferSourceNode>();
  private ready = false;

  /** Lazy-init AudioContext — call from user gesture handler */
  ensureContext(): void {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      this.ready = true;
    } catch {
      this.ctx = null;
      this.ready = false;
    }
  }

  /** Load a single WAV file into slot */
  async load(slot: number, url: string): Promise<void> {
    if (!this.ctx) this.ensureContext();
    if (!this.ctx) return;
    try {
      const r = await fetch(url);
      if (!r.ok) return;
      const ab = await r.arrayBuffer();
      const buf = await this.ctx.decodeAudioData(ab);
      this.buffers.set(slot, buf);
    } catch { /* silent */ }
  }

  /** Load all 10 WAVs in parallel */
  async loadAll(base = "/SFX"): Promise<void> {
    this.ensureContext();
    if (!this.ctx) return;
    const names = [
      [1, "BOLT.WAV"], [2, "HIT.WAV"], [3, "JUMP.WAV"], [4, "KEY.WAV"],
      [5, "LIFE.WAV"], [6, "OBJECT.WAV"], [7, "PINCHE.WAV"], [8, "AH.WAV"],
      [9, "AMBIENT1.WAV"], [10, "AMBIENT2.WAV"],
    ];
    await Promise.all(names.map(([s, n]) => this.load(s as number, `${base}/${n}`)));
  }

  /**
   * Play a sound effect.
   * @param slot DQB slot (1-10)
   * @param loop looped playback (AMBIENT1/2)
   * @param freq playback rate — 11025 = native, higher = faster/pitched up
   */
  play(slot: number, loop = false, freq = 11025): void {
    if (!this.ctx || !this.ready) return;
    const buf = this.buffers.get(slot);
    if (!buf) return;
    const entry = CATALOG_BY_SLOT.get(slot);
    const voice = entry?.voice ?? 1;
    const volume = entry?.volume ?? 0.75;

    // Resume if suspended (autoplay policy)
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});

    // Stop existing source on same voice
    this.stopVoice(voice);

    // Get or create per-voice GainNode
    let gain = this.voiceGains.get(voice);
    if (!gain) {
      gain = this.ctx.createGain();
      gain.connect(this.ctx.destination);
      this.voiceGains.set(voice, gain);
    }
    gain.gain.value = volume;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    src.playbackRate.value = freq / 11025;
    src.connect(gain);
    src.start();

    // Track for stopVoice
    this.activeByVoice.set(voice, src);
    src.onended = () => {
      if (this.activeByVoice.get(voice) === src) {
        this.activeByVoice.delete(voice);
      }
    };
  }

  /** Play by SFX_SLOT key name */
  playByName(name: keyof typeof SFX_SLOT, loop = false, freq = 11025): void {
    this.play(SFX_SLOT[name], loop, freq);
  }

  /** Stop playback on a specific voice (QB DQBstopVoice) */
  stopVoice(voice: number): void {
    const src = this.activeByVoice.get(voice);
    if (src) {
      try { src.stop(); } catch { /* already stopped */ }
      this.activeByVoice.delete(voice);
    }
  }

  /** Stop all voices */
  stopAll(): void {
    for (const [v] of this.activeByVoice) this.stopVoice(v);
  }

  isReady(): boolean { return this.ready; }
  static catalog(): readonly SfxEntry[] { return SFX_CATALOG; }
}
