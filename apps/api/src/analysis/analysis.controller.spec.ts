import { describe, expect, it } from "vitest";

import { ApiException } from "../shared/errors";
import { ZodValidationPipe } from "../shared/zod-validation.pipe";
import { enqueueAnalysisBodySchema } from "./analysis.types";

describe("enqueue analysis body schema", () => {
  const pipe = new ZodValidationPipe(enqueueAnalysisBodySchema);

  it("accepts a matchId", () => {
    expect(pipe.transform({ matchId: "EUW1_123" })).toEqual({ matchId: "EUW1_123" });
  });

  it("rejects missing, empty, and oversized matchId", () => {
    expect(() => pipe.transform({})).toThrow(ApiException);
    expect(() => pipe.transform({ matchId: "" })).toThrow(ApiException);
    expect(() => pipe.transform({ matchId: "x".repeat(65) })).toThrow(ApiException);
  });
});
