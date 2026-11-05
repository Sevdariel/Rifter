import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ApiException } from "./errors";
import { ZodValidationPipe } from "./zod-validation.pipe";

const schema = z.object({ matchId: z.string().min(1), limit: z.coerce.number().int().max(50).optional() });

describe("ZodValidationPipe", () => {
  const pipe = new ZodValidationPipe(schema);

  it("returns parsed data on valid input", () => {
    expect(pipe.transform({ matchId: "EUW1_1", limit: "10" })).toEqual({ matchId: "EUW1_1", limit: 10 });
  });

  it("throws VALIDATION_ERROR with a field map on invalid input", () => {
    try {
      pipe.transform({ matchId: "", limit: "99" });
      expect.unreachable();
    } catch (err) {
      const apiErr = err as ApiException;
      expect(apiErr).toBeInstanceOf(ApiException);
      expect(apiErr.code).toBe("VALIDATION_ERROR");
      expect(apiErr.getStatus()).toBe(400);
      expect(Object.keys(apiErr.fields ?? {}).sort()).toEqual(["limit", "matchId"]);
    }
  });
});
