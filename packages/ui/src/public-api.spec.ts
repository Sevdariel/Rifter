import { describe, expect, it } from "vitest";

import { UI_PACKAGE_VERSION } from "./public-api";

describe("ui package", () => {
  it("exports a package version", () => {
    expect(UI_PACKAGE_VERSION).toBe("0.0.0");
  });
});
