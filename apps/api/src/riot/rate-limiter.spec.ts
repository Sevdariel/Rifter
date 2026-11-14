import { describe, expect, it } from "vitest";

import { RateLimiter } from "./rate-limiter";

describe("RateLimiter", () => {
  it("admits bursts up to the window limit without sleeping", async () => {
    let now = 0;
    const sleeps: number[] = [];
    const limiter = new RateLimiter(
      [{ limit: 2, windowMs: 1000 }],
      () => now,
      async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    );
    await limiter.acquire();
    await limiter.acquire();
    expect(sleeps).toEqual([]);
  });

  it("sleeps until the oldest stamp exits a saturated window", async () => {
    let now = 0;
    const sleeps: number[] = [];
    const limiter = new RateLimiter(
      [{ limit: 2, windowMs: 1000 }],
      () => now,
      async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    );
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(sleeps).toEqual([1000]);
  });

  it("enforces the long window independently of the burst window", async () => {
    let now = 0;
    const sleeps: number[] = [];
    const limiter = new RateLimiter(
      [
        { limit: 5, windowMs: 1000 },
        { limit: 2, windowMs: 60_000 },
      ],
      () => now,
      async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    );
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(sleeps.at(-1)).toBe(60_000);
  });
});
