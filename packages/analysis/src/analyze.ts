import { computeMetrics } from './metrics.js';
import { detectMoments } from './moment-detection.js';
import type { NormalizedMatch } from './normalized-match.js';
import { AnalysisError, type OllamaUsage } from './ollama-client.js';
import { buildPrompt } from './prompt-builder.js';
import {
  llmOutputJsonSchema,
  REPORT_CONTRACT_VERSION,
  type AnalysisReport,
  type ReportLocale,
} from './report-contract.js';
import { validateAnalysisReport, type ReportValidationContext } from './report-validation.js';

/**
 * Pipeline facade: NormalizedMatch -> metrics -> moment candidates ->
 * prompt -> LLM -> validated report. Each step is also exported separately
 * for tests and per-stage observability (`analysis_jobs`).
 *
 * Validation retry: on `output`-stage failure the validation errors are fed
 * back once and the call retried; a second failure throws `AnalysisError`.
 * `context`-stage failures are pipeline faults — never fed to the model.
 */

export interface AnalyzeMatchDeps {
  /** Contents of `prompts/v${PROMPT_VERSION}.md`, loaded by the caller. */
  template: string;
  /** Calls the model; the Ollama client is the production implementation. */
  generate: (req: { prompt: string; format: Record<string, unknown> }) => Promise<{ text: string; usage: OllamaUsage }>;
  /** Digest of the served model, for report provenance. */
  modelDigest: string;
  /** Validation retries with feedback (bounded; default 1). */
  maxRetries?: number;
}

export interface AnalyzeMatchInput {
  match: NormalizedMatch;
  locale: ReportLocale;
}

export interface AnalyzeTimings {
  metricsMs: number;
  momentsMs: number;
  promptMs: number;
  llmMs: number;
  validationMs: number;
  totalMs: number;
}

export interface AnalysisResult {
  report: AnalysisReport;
  usage: OllamaUsage;
  retries: number;
  timings: AnalyzeTimings;
}

function now(): number {
  return Date.now();
}

function usagePlus(a: OllamaUsage, b: OllamaUsage): OllamaUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

const ZERO_USAGE: OllamaUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

/** Runs the full analysis pipeline for one normalized match. */
export async function analyzeMatch(input: AnalyzeMatchInput, deps: AnalyzeMatchDeps): Promise<AnalysisResult> {
  const started = now();
  const { match, locale } = input;
  const maxRetries = deps.maxRetries ?? 1;

  const t0 = now();
  const metrics = computeMetrics(match);
  const t1 = now();
  const { candidates } = detectMoments(match);
  const t2 = now();
  const built = buildPrompt({ match, metrics, candidates, locale, template: deps.template });
  const t3 = now();

  const ctx: ReportValidationContext = {
    candidates: built.shownCandidates,
    gameDurationMs: match.gameDurationMs,
    metadata: {
      matchId: match.matchId,
      patch: match.patch,
      contractVersion: REPORT_CONTRACT_VERSION,
      promptVersion: built.promptVersion,
      modelDigest: deps.modelDigest,
      locale,
      dataTier: match.dataTier,
    },
  };

  let prompt = built.prompt;
  let usage = ZERO_USAGE;
  let retries = 0;
  let llmMs = 0;
  let validationMs = 0;
  let lastErrors: string[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const g0 = now();
    const generated = await deps.generate({ prompt, format: llmOutputJsonSchema });
    llmMs += now() - g0;
    usage = usagePlus(usage, generated.usage);

    const v0 = now();
    let raw: unknown;
    let parseFailed = false;
    try {
      raw = JSON.parse(generated.text);
    } catch {
      parseFailed = true;
    }
    const result = parseFailed
      ? { ok: false as const, stage: 'output' as const, errors: ['response is not valid JSON'] }
      : validateAnalysisReport(raw, ctx);
    validationMs += now() - v0;

    if (result.ok) {
      return {
        report: result.report,
        usage,
        retries,
        timings: {
          metricsMs: t1 - t0,
          momentsMs: t2 - t1,
          promptMs: t3 - t2,
          llmMs,
          validationMs,
          totalMs: now() - started,
        },
      };
    }
    if (result.stage === 'context') {
      throw new AnalysisError('pipeline', `validation context invalid: ${result.errors.join('; ')}`);
    }
    lastErrors = result.errors;
    retries += 1;
    // Language directive ends the built prompt; the correction section is in
    // English, so close with a locale reminder to keep small models on-locale.
    prompt = `${built.prompt}\n\n## Correction required\nYour previous output failed validation:\n${result.errors.map((e) => `- ${e}`).join('\n')}\nReturn corrected JSON only, in the same output language as before.`;
  }

  throw new AnalysisError(
    'output',
    `LLM output failed validation after ${retries} attempt(s): ${lastErrors.join('; ')}`,
  );
}
