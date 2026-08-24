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
  /** Pending retry handlers — kept so we can ignore AbortError after stop() */
  private _retryBound = false;

  constructor() {
    this.audio = new Audio();
    this.audio.loop = true;
    this.audio.preload = "auto";
    this.audio.crossOrigin = "anonymous";
    // Volume default
    this.audio.volume = 0.7;
  }

  async init(): Promise<void> {
    // Must be called from a user gesture handler (click/touch/keydown).
    // Chrome blocks AudioContext creation outside a gesture stack.
    await this.ensureContext();
  }

  /** Create (or resume) AudioContext lazily after a user gesture. */
  private async ensureContext(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === "suspended") {
        try { await this.ctx.resume(); } catch { /* ignore */ }
      }
      return;
    }
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.audio.volume;
      try {
        // MediaElementSource can only be created once per element
        this.source = this.ctx.createMediaElementSource(this.audio);
        this.source.connect(this.gain).connect(this.ctx.destination);
      } catch {
        // e.g. already connected after hot-reload — ignore
        this.source = null;
      }
      if (this.ctx.state === "suspended") {
        try { await this.ctx.resume(); } catch { /* ignore */ }
      }
    } catch {
      this.ctx = null;
      this.gain = null;
      this.source = null;
    }
  }

  /** Resume AudioContext on user gesture if suspended */
  private async resumeCtx(): Promise<void> {
    await this.ensureContext();
  }

  /**
   * Load and play a song. `url` is like `/MUSIC/G66A.ogg`.
   * If OGG 404, caller may retry with fallback (will just warn).
   * Handles autoplay-block vs intentional abort cleanly.
   */
  async loadSong(url: string): Promise<void> {
    // Don't force AudioContext before a gesture — try plain <audio> first.
    // If blocked, the retry handler will ensure the context afterwards.
    this.audio.loop = true;
    this.audio.src = url;
    this.audio.currentTime = 0;
    try {
      const p = this.audio.play();
      if (p !== undefined) await p;
      // Play succeeded — now we can (and should) ensure the Web Audio graph
      // is wired so future fadeOut/volume works, but don't let it block.
      this.ensureContext().catch(() => {});
    } catch (e: unknown) {
      const err = e as DOMException | Error | null;
      const name = (err as DOMException)?.name ?? (err as Error)?.name ?? "";
      const msg = (err as Error)?.message ?? String(e);

      // Intentional abort: stop()/fadeOut() called before fetch finished,
      // or src changed (user skipped title quickly). Silently ignore —
      // no retry, no warning.
      if (name === "AbortError" || msg.includes("was aborted") || msg.includes("interrupted by a call to pause")) {
        return;
      }

      // Autoplay policy block — retry once after next user gesture,
      // ensuring the AudioContext is created at gesture time (not before).
      if (name === "NotAllowedError" || msg.includes("autoplay") || msg.includes("NotAllowed")) {
        console.debug(`MusicPlayer: autoplay blocked for ${url}, will retry on next gesture`);
        const retry = async () => {
          window.removeEventListener("click", retry);
          window.removeEventListener("keydown", retry);
          this._retryBound = false;
          // Create/resume AudioContext now that we have a gesture
          await this.ensureContext().catch(() => {});
          try {
            const p = this.audio.play();
            if (p !== undefined) await p;
          } catch (e2: unknown) {
            const n2 = (e2 as DOMException)?.name ?? "";
            // Still blocked or aborted — ignore, don't loop
            if (n2 === "AbortError") return;
            console.debug(`MusicPlayer: retry play still blocked for ${url}`, e2);
          }
        };
        if (!this._retryBound) {
          this._retryBound = true;
          window.addEventListener("click", retry, { once: true });
          window.addEventListener("keydown", retry, { once: true });
        }
        return;
      }

      // Other errors (404, decode failure, etc.) — warn once
      console.warn(`MusicPlayer: play failed for ${url}`, e);
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
