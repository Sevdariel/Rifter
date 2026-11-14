import { describe, expect, it } from "vitest";

import { ApiException } from "../shared/errors";
import { ZodValidationPipe } from "../shared/zod-validation.pipe";
import { syncAllBodySchema, syncOneBodySchema, syncRecentBodySchema } from "./matches.types";

describe("sync body schemas", () => {
  it("accepts a single matchId", () => {
    const body = new ZodValidationPipe(syncOneBodySchema).transform({ matchId: "EUW1_1" });
    expect(body).toEqual({ matchId: "EUW1_1" });
  });

  it("caps recent sync at 20", () => {
    expect(() => new ZodValidationPipe(syncRecentBodySchema).transform({ count: 21 })).toThrow(ApiException);
    expect(new ZodValidationPipe(syncRecentBodySchema).transform({ count: 20 })).toEqual({
      count: 20,
    });
  });

  it("accepts an empty all-sync body and from variants", () => {
    const pipe = new ZodValidationPipe(syncAllBodySchema);
    expect(pipe.transform(undefined)).toEqual({});
    expect(pipe.transform({})).toEqual({});
    expect(pipe.transform({ from: { date: "2025-01-01" } })).toEqual({
      from: { date: "2025-01-01" },
    });
    expect(pipe.transform({ from: { season: "2025" } })).toEqual({
      from: { season: "2025" },
    });
  });

  it("rejects date+season together and bad shapes", () => {
    const pipe = new ZodValidationPipe(syncAllBodySchema);
    expect(() => pipe.transform({ from: { date: "2025-01-01", season: "2025" } })).toThrow(ApiException);
    expect(() => pipe.transform({ from: { season: "spring" } })).toThrow(ApiException);
  });
});
