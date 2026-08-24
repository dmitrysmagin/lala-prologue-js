/**
 * Phase 6/12 — Music player (simplified per updated plan)
 * S3M → OGG pre-converted via `adplay` → WAV → `ffmpeg`/`oggenc`.
 * Runtime just plays OGG via HTMLAudioElement (loop, volume, fade).
 * Falls back gracefully if OGG not yet present (logs warning, no throw).
 */

export class MusicPlayer {
  private audio: HTMLAudioElement;
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;

  constructor() {
    this.audio = new Audio();
    this.audio.loop = true;
    this.audio.preload = "auto";
    this.audio.crossOrigin = "anonymous";
    // Volume default
    this.audio.volume = 0.7;
  }

  async init(): Promise<void> {
    try {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      // Connect media element through gain for fade control
      this.gain = this.ctx.createGain();
      this.source = this.ctx.createMediaElementSource(this.audio);
      this.source.connect(this.gain).connect(this.ctx.destination);
    } catch {
      // Headless / no AudioContext — fallback to plain <audio>
      this.ctx = null;
      this.gain = null;
      this.source = null;
    }
  }

  /** Resume AudioContext on user gesture if suspended */
  private async resumeCtx(): Promise<void> {
    if (this.ctx && this.ctx.state === "suspended") {
      try { await this.ctx.resume(); } catch { /* ignore */ }
    }
  }

  /**
   * Load and play a song. `url` is like `/MUSIC/G66A.OGG`.
   * If OGG 404, caller may retry with `.S3M` fallback (will just warn).
   */
  async loadSong(url: string): Promise<void> {
    await this.resumeCtx();
    this.audio.loop = true;
    this.audio.src = url;
    this.audio.currentTime = 0;
    try {
      await this.audio.play();
    } catch (e) {
      // Autoplay blocked until user gesture — will retry on next interaction
      console.warn(`MusicPlayer: play blocked for ${url}`, e);
      // Attach one-time click handler to retry
      const retry = async () => {
        window.removeEventListener("click", retry);
        window.removeEventListener("keydown", retry);
        try { await this.audio.play(); } catch { /* still blocked */ }
      };
      window.addEventListener("click", retry, { once: true });
      window.addEventListener("keydown", retry, { once: true });
    }
  }

  stop(): void {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.audio.removeAttribute("src");
    try { this.audio.load(); } catch { /* ignore */ }
  }

  pause(): void {
    this.audio.pause();
  }

  resume(): void {
    this.audio.play().catch(() => {});
    this.resumeCtx();
  }

  setVolume(v: number): void {
    const vol = Math.max(0, Math.min(1, v));
    this.audio.volume = vol;
    if (this.gain) this.gain.gain.value = vol;
  }

  /** Fade out over ms then stop */
  async fadeOut(ms = 500): Promise<void> {
    const steps = 16;
    const stepMs = ms / steps;
    const start = this.audio.volume;
    for (let i = steps - 1; i >= 0; i--) {
      this.setVolume((start * i) / steps);
      await new Promise<void>((r) => setTimeout(r, stepMs));
    }
    this.stop();
    this.setVolume(start);
  }

  isPlaying(): boolean {
    return !this.audio.paused && !this.audio.ended;
  }
}
