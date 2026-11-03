#!/usr/bin/env node
/**
 * Dev runner: fixture -> normalize -> analyzeMatch -> real local Ollama ->
 * validated report on stdout. Also records raw LLM responses with --record
 * (used to build adapter test fixtures).
 *
 * Usage:
 *   pnpm -C packages/analysis build   # runner imports dist/
 *   node packages/analysis/scripts/run-analysis.mjs <fixture.json>
 *     [--locale pl|en] [--model qwen3.5:9b] [--base-url http://localhost:11434]
 *     [--record responses.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import {
  analyzeMatch,
  matchV5ToNormalized,
  ollamaGenerateJson,
  ollamaModelDigest,
  PROMPT_VERSION,
} from '../dist/index.js';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const FLAGS = new Set(['--locale', '--model', '--base-url', '--record']);
function argValue(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
}
// First bare arg is the fixture path — flag values are consumed by their flag.
const positionals = args.filter((a, i) => !a.startsWith('--') && !FLAGS.has(args[i - 1]));

const fixturePath = positionals[0];
if (!fixturePath) {
  console.error('usage: run-analysis.mjs <fixture.json> [--locale] [--model] [--base-url] [--record]');
  process.exit(1);
}
const locale = argValue('--locale', 'pl');
const model = argValue('--model', 'qwen3.5:9b');
const baseUrl = argValue('--base-url', 'http://localhost:11434');
const recordPath = argValue('--record', null);

const raw = JSON.parse(readFileSync(resolve(fixturePath), 'utf8'));
const match = matchV5ToNormalized({ match: raw.match, timeline: raw.timeline }, 'puuid-target');
const template = readFileSync(resolve(PKG, 'prompts', `v${PROMPT_VERSION}.md`), 'utf8');
const clientConfig = { baseUrl, model };
const modelDigest = (await ollamaModelDigest(clientConfig)) ?? 'unknown';
console.error(`model ${model} digest ${modelDigest}`);

const recorded = [];
const generate = async (req) => {
  const result = await ollamaGenerateJson(clientConfig, req);
  if (recordPath) recorded.push({ request: { promptLength: req.prompt.length }, response: result });
  return result;
};

try {
  const result = await analyzeMatch({ match, locale }, { template, generate, modelDigest });
  if (recordPath) writeFileSync(recordPath, JSON.stringify(recorded, null, 2));
  console.error(
    `usage ${result.usage.totalTokens} tok, retries ${result.retries}, llm ${Math.round(result.timings.llmMs)} ms`,
  );
  console.log(JSON.stringify(result.report, null, 2));
} catch (err) {
  if (recordPath && recorded.length) writeFileSync(recordPath, JSON.stringify(recorded, null, 2));
  console.error(`analysis failed [${err.stage ?? 'unknown'}]: ${err.message}`);
  process.exit(1);
}
