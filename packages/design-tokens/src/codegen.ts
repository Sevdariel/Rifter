/**
 * Codegen entry for design tokens. Figma Variables are the source of truth;
 * the sync pipeline (Figma bridge -> this codegen -> tokens.css/tokens.ts)
 * is wired in milestone M4. These renderers take a flat token map.
 */

export type TokenMap = Record<string, string>;

/** Render a flat token map as CSS custom properties under :root. */
export function renderTokensCss(tokens: TokenMap): string {
  const lines = Object.keys(tokens)
    .sort()
    .map((name) => `  --${name}: ${tokens[name]};`);
  return `:root {\n${lines.join("\n")}\n}\n`;
}

/** Render a flat token map as a TypeScript const object. */
export function renderTokensTs(tokens: TokenMap): string {
  const entries = Object.keys(tokens)
    .sort()
    .map((name) => `  ${JSON.stringify(name)}: ${JSON.stringify(tokens[name])},`);
  return `export const tokens = {\n${entries.join("\n")}\n} as const;\n`;
}
