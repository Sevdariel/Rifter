/**
 * Ollama HTTP client on portable `fetch` — no Node-only APIs, so it runs in
 * desktop, web tests, and api. `fetchImpl` is injectable for recorded-response
 * tests; tests never call a live LLM.
 *
 * Design per project rules: non-streaming `/api/generate`, `format` = the
 * report JSON schema (constrained decoding), `keep_alive: 0` (model unloads
 * after the report), temperature ~0, model/token/timeout from config.
 */

export type AnalysisStage = 'budget' | 'ollama' | 'output' | 'pipeline';

/** Typed pipeline failure carrying the stage that produced it. */
export class AnalysisError extends Error {
  readonly stage: AnalysisStage;
  constructor(stage: AnalysisStage, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AnalysisError';
    this.stage = stage;
  }
}

export interface OllamaClientConfig {
  /** e.g. `http://localhost:11434` */
  baseUrl: string;
  model: string;
  /** Output token cap (per-analysis output budget ~4k). */
  numPredict?: number;
  /** Approximate prompt budget in chars (~8k tokens at ~4 chars/token). */
  maxPromptChars?: number;
  temperature?: number;
  timeoutMs?: number;
  /** Injectable for tests; defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

export interface OllamaUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface OllamaGenerateResult {
  text: string;
  usage: OllamaUsage;
}

interface OllamaGenerateResponse {
  response?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

const DEFAULTS = {
  numPredict: 4096,
  maxPromptChars: 32_000,
  temperature: 0,
  timeoutMs: 120_000,
} as const;

/** Non-streaming structured generation against a local Ollama. */
export async function ollamaGenerateJson(
  config: OllamaClientConfig,
  req: { prompt: string; format: Record<string, unknown> },
): Promise<OllamaGenerateResult> {
  const cfg = { ...DEFAULTS, ...config };
  if (req.prompt.length > cfg.maxPromptChars) {
    throw new AnalysisError(
      'budget',
      `prompt is ${req.prompt.length} chars, over the ${cfg.maxPromptChars}-char budget`,
    );
  }

  const fetchImpl = cfg.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetchImpl(`${cfg.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: cfg.model,
        prompt: req.prompt,
        format: req.format,
        stream: false,
        keep_alive: 0,
        // Thinking models would burn the output budget on hidden reasoning
        // and emit no final answer; constrained decoding needs it off.
        think: false,
        options: { temperature: cfg.temperature, num_predict: cfg.numPredict },
      }),
    });
    if (!res.ok) {
      throw new AnalysisError('ollama', `Ollama HTTP ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as OllamaGenerateResponse;
    if (body.error) {
      throw new AnalysisError('ollama', `Ollama error: ${body.error}`);
    }
    if (typeof body.response !== 'string') {
      throw new AnalysisError('ollama', 'Ollama response missing `response` text');
    }
    const promptTokens = body.prompt_eval_count ?? 0;
    const completionTokens = body.eval_count ?? 0;
    return {
      text: body.response,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  } catch (err) {
    if (err instanceof AnalysisError) throw err;
    if ((err as { name?: string }).name === 'AbortError') {
      throw new AnalysisError('ollama', `Ollama request timed out after ${cfg.timeoutMs} ms`, { cause: err });
    }
    throw new AnalysisError('ollama', `Ollama request failed: ${String(err)}`, { cause: err });
  } finally {
    clearTimeout(timer);
  }
}

/** Model digest for report provenance (`/api/tags`), `null` when unavailable. */
export async function ollamaModelDigest(config: OllamaClientConfig): Promise<string | null> {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? DEFAULTS.timeoutMs);
  try {
    const res = await fetchImpl(`${config.baseUrl}/api/tags`, { signal: controller.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { models?: { name?: string; model?: string; digest?: string }[] };
    // `name` in /api/tags always carries the tag (e.g. `qwen3.5:9b`); accept a
    // bare repo name too by comparing against `<model>:latest` as well.
    const match = body.models?.find(
      (m) => m.name === config.model || m.model === config.model || m.name === `${config.model}:latest`,
    );
    // /api/tags returns a bare hex digest; normalize to the OCI-style
    // `sha256:<hex>` form used in report metadata and the model manifest.
    const digest = match?.digest;
    if (!digest) return null;
    return digest.includes(':') ? digest : `sha256:${digest}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
