/**
 * Phase 4 — Keyboard (scancode-based)
 * Wraps DOM keydown/keyup → QB scancode Set + queues.
 * Mirrors INT 9h ISR + DQBinkey$/readKey semantics.
 */

// QB scancodes (hex) — matches PORTING_PLAN.md
export const SC_CTRL  = 0x1D;
export const SC_ENTER = 0x1C;
export const SC_LEFT  = 0x4B;
export const SC_UP    = 0x48;
export const SC_RIGHT = 0x4D;
export const SC_W     = 0x11;
export const SC_E     = 0x12;
export const SC_R     = 0x13;

// Full map code -> scancode (extendable, but spec minimum is above)
const CODE_TO_SCANCODE: Record<string, number> = {
  ControlLeft:  SC_CTRL,
  ControlRight: SC_CTRL,
  Enter:        SC_ENTER,
  NumpadEnter:  SC_ENTER,
  ArrowLeft:    SC_LEFT,
  ArrowUp:      SC_UP,
  ArrowRight:   SC_RIGHT,
  KeyW:         SC_W,
  KeyE:         SC_E,
  KeyR:         SC_R,
  // Extras useful for debugging / later phases (non-spec but harmless)
  ArrowDown:    0x50,
  Space:        0x39,
  Escape:       0x01,
  KeyA:         0x1E,
  KeyS:         0x1F,
  KeyD:         0x20,
};

// Reverse for diagnostics (first code wins for SC_CTRL)
const SCANCODE_TO_CODES: Record<number, string[]> = {};
for (const [code, sc] of Object.entries(CODE_TO_SCANCODE)) {
  (SCANCODE_TO_CODES[sc] ??= []).push(code);
}

export class Keyboard {
  private pressed = new Set<number>();
  /** scancode FIFO for readKey() */
  private scanQueue: number[] = [];
  /** char FIFO for inkey() — mirrors DQBinkey$ */
  private charQueue: string[] = [];
  /** waiters for waitKey(sc) */
  private waiters: { sc: number; resolve: () => void }[] = [];

  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private attached = false;
  private target: Window | HTMLElement;

  constructor(target: Window | HTMLElement = window) {
    this.target = target;
    this.onKeyDown = (e: KeyboardEvent) => {
      let sc = CODE_TO_SCANCODE[e.code];
      // Fallback: if code not mapped but key is Enter, treat as SC_ENTER (covers some IME/layouts)
      if (sc === undefined && e.key === "Enter") sc = SC_ENTER;
      if (sc === undefined && e.key === " ") sc = 0x39;
      if (sc === undefined) return;
      // Always queue the scancode press (even if held) — but avoid repeat flooding for char queue
      // Pressed set tracks physical held state
      const wasDown = this.pressed.has(sc);
      this.pressed.add(sc);

      // Queue scancode only on initial press (no auto-repeat)
      if (!e.repeat || !wasDown) {
        this.scanQueue.push(sc);
        // Char queue: push printable char if available
        // For spec keys, Enter → "\r", otherwise e.key single char
        if (e.key.length === 1) {
          this.charQueue.push(e.key);
        } else if (sc === SC_ENTER) {
          this.charQueue.push("\r");
        } else if (e.code.startsWith("Key") && e.key.length === 1) {
          this.charQueue.push(e.key);
        }
        // Resolve any waitKey waiting for this sc
        this.waiters = this.waiters.filter((w) => {
          if (w.sc === sc) { w.resolve(); return false; }
          return true;
        });
      }

      // Prevent scrolling for game keys
      if (sc === SC_UP || sc === SC_LEFT || sc === SC_RIGHT || sc === SC_ENTER || sc === SC_CTRL) {
        // Only prevent if target is window / game canvas area to avoid breaking inputs elsewhere;
        // for port we prevent unconditionally for mapped keys.
        e.preventDefault();
      }
    };

    this.onKeyUp = (e: KeyboardEvent) => {
      let sc = CODE_TO_SCANCODE[e.code];
      if (sc === undefined && e.key === "Enter") sc = SC_ENTER;
      if (sc === undefined && e.key === " ") sc = 0x39;
      if (sc === undefined) return;
      this.pressed.delete(sc);
    };

    this.attach();
  }

  private attach(): void {
    if (this.attached) return;
    this.target.addEventListener("keydown", this.onKeyDown as EventListener);
    this.target.addEventListener("keyup", this.onKeyUp as EventListener);
    this.attached = true;
  }

  detach(): void {
    if (!this.attached) return;
    this.target.removeEventListener("keydown", this.onKeyDown as EventListener);
    this.target.removeEventListener("keyup", this.onKeyUp as EventListener);
    this.attached = false;
  }

  /** Direct scancode test — matches QB `isDown(sc)` */
  isDown(scancode: number): boolean {
    return this.pressed.has(scancode & 0xff);
  }

  /** Test by DOM code string (convenience) */
  isDownCode(code: string): boolean {
    const sc = CODE_TO_SCANCODE[code];
    return sc !== undefined ? this.pressed.has(sc) : false;
  }

  /** Dequeue next scancode press, or 0 if none */
  readKey(): number {
    return this.scanQueue.shift() ?? 0;
  }

  /** Peek without dequeue */
  peekKey(): number {
    return this.scanQueue[0] ?? 0;
  }

  /** DQBinkey$ semantics — dequeue next char, or "" if none */
  inkey(): string {
    return this.charQueue.shift() ?? "";
  }

  peekInkey(): string {
    return this.charQueue[0] ?? "";
  }

  /** Resolve once `sc` is pressed (immediate if already down) */
  waitKey(sc: number): Promise<void> {
    const target = sc & 0xff;
    if (this.pressed.has(target)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.waiters.push({ sc: target, resolve });
    });
  }

  /** Clear pressed set and queues (matches QB `clear` / flush) */
  clear(): void {
    this.pressed.clear();
    this.scanQueue.length = 0;
    this.charQueue.length = 0;
    // Note: waiters are NOT cleared — caller can decide; we keep them for waitKey
  }

  /** Fully reset including waiters */
  reset(): void {
    this.clear();
    this.waiters.length = 0;
  }

  /** For debugging / HUD: snapshot of pressed scancodes */
  pressedSnapshot(): number[] {
    return [...this.pressed].sort((a, b) => a - b);
  }

  /** Human-readable mapping help */
  static scancodeToCodes(sc: number): string[] {
    return SCANCODE_TO_CODES[sc & 0xff] ?? [];
  }

  static codeToScancode(code: string): number | undefined {
    return CODE_TO_SCANCODE[code];
  }
}
