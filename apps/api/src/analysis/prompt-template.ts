import { readFileSync } from "node:fs";

import { PROMPT_VERSION } from "@rifter/analysis";

let cached: string | undefined;

/**
 * Contents of the active `prompts/v${PROMPT_VERSION}.md`, resolved through the
 * `@rifter/analysis` exports map. Loaded once — a prompt change means a
 * version bump and a process restart anyway.
 */
export function loadPromptTemplate(): string {
  if (cached === undefined) {
    const path = require.resolve(`@rifter/analysis/prompts/v${PROMPT_VERSION}.md`);
    cached = readFileSync(path, "utf8");
  }
  return cached;
}
