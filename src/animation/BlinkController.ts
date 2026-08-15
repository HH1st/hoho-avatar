export interface BlinkOptions {
  minIntervalMs?: number;
  maxIntervalMs?: number;
  durationMs?: number;
}

export class BlinkController {
  private readonly minIntervalMs: number;
  private readonly maxIntervalMs: number;
  private readonly durationMs: number;
  private nextBlink = 0;
  private closedUntil = 0;

  constructor(options: BlinkOptions = {}) {
    this.minIntervalMs = options.minIntervalMs ?? 2200;
    this.maxIntervalMs = options.maxIntervalMs ?? 5200;
    this.durationMs = options.durationMs ?? 140;
  }

  start(now = performance.now()): void {
    this.closedUntil = 0;
    this.schedule(now);
  }

  isClosed(now = performance.now()): boolean {
    if (now >= this.nextBlink) {
      this.closedUntil = now + this.durationMs;
      this.schedule(this.closedUntil);
    }
    return now < this.closedUntil;
  }

  private schedule(now: number): void {
    this.nextBlink = now + this.minIntervalMs + Math.random() * (this.maxIntervalMs - this.minIntervalMs);
  }
}
