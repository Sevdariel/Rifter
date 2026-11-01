import { describe, expect, it } from "vitest";

import { REPORT_CONTRACT_VERSION, type DataTier } from "./index.js";

describe("analysis package", () => {
  it("exports the report contract version", () => {
    expect(REPORT_CONTRACT_VERSION).toBe(0);
  });

  it("exposes the data tier union", () => {
    const tiers: DataTier[] = ["basic", "full"];
    expect(tiers).toHaveLength(2);
  });
});
