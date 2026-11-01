import { describe, expect, it } from "vitest";

import { renderTokensCss, renderTokensTs } from "./codegen.js";

describe("codegen", () => {
  const tokens = { "color-surface": "#101418", "space-md": "16px" };

  it("renders CSS custom properties sorted under :root", () => {
    expect(renderTokensCss(tokens)).toBe(
      ":root {\n  --color-surface: #101418;\n  --space-md: 16px;\n}\n",
    );
  });

  it("renders a TS const object", () => {
    expect(renderTokensTs(tokens)).toContain('"color-surface": "#101418"');
  });
});
