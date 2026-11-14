import type { RateWindow, Sleep } from "./riot.types";

const defaultSleep: Sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Sliding-window rate limiter. Every acquire() records a timestamp; a call
 * waits until the oldest stamp in each saturated window has aged out.
 * Development keys ship 20 req/1s + 100 req/2min — the second window is the
 * sustained ceiling (~0.83 req/s), the first is just a burst cap.
 */
export class RateLimiter {
  private readonly stamps: number[] = [];
  private readonly maxWindowMs: number;

  public constructor(
    private readonly rateWindows: readonly RateWindow[],
    private readonly now: () => number = Date.now,
    private readonly sleep: Sleep = defaultSleep,
  ) {
    this.maxWindowMs = Math.max(...this.rateWindows.map((w) => w.windowMs));
  }

  public async acquire(): Promise<void> {
    for (;;) {
      const wait = this.computeWaitMs();
      if (wait <= 0) {
        this.stamps.push(this.now());
        return;
      }
      await this.sleep(wait);
    }
  }

  private computeWaitMs(): number {
    const now = this.now();
    while (this.stamps.length > 0 && this.stamps[0] <= now - this.maxWindowMs) {
      this.stamps.shift();
    }
    let wait = 0;
    for (const { limit, windowMs } of this.rateWindows) {
      const boundary = now - windowMs;
      const inWindow = this.stamps.filter((s) => s > boundary).length;
      if (inWindow >= limit) {
        const oldest = this.stamps.find((s) => s > boundary) ?? now;
        wait = Math.max(wait, oldest + windowMs - now);
      }
    }
    return wait;
  }
}
