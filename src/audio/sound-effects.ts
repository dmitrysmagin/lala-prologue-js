/**
 * Minimal SFX stub (WAV via Web Audio) — full impl is Phase 12,
 * but title needs a placeholder so imports don't break.
 */
export class SoundEffects {
  private ctx: AudioContext | null = null;
  private buffers = new Map<number, AudioBuffer>();

  async init(): Promise<void> {
    try {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch { this.ctx = null; }
  }

  async load(slot: number, url: string): Promise<void> {
    if (!this.ctx) return;
    try {
      const r = await fetch(url);
      if (!r.ok) return;
      const ab = await r.arrayBuffer();
      const buf = await this.ctx.decodeAudioData(ab);
      this.buffers.set(slot, buf);
    } catch { /* ignore */ }
  }

  play(_slot: number, _loop = false, _freq = 11025): void {
    if (!this.ctx) return;
    const buf = this.buffers.get(_slot);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = _loop;
    src.playbackRate.value = _freq / 11025;
    src.connect(this.ctx.destination);
    src.start();
  }

  stopVoice(_voice: number): void { /* stub */ }
}
