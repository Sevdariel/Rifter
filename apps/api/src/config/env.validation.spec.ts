import { describe, expect, it } from "vitest";

import { validateEnv } from "./env.validation";

describe("validateEnv", () => {
  it("applies defaults and coerces PORT", () => {
    const env = validateEnv({ PORT: "3001" });
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3001);
  });

  it("rejects an invalid PORT", () => {
    expect(() => validateEnv({ PORT: "not-a-port" })).toThrow();
  });
});
