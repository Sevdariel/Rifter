import { describe, expect, it, vi } from 'vitest';

import { AnalysisError, ollamaGenerateJson, ollamaModelDigest } from './ollama-client.js';

const RECORDED_RESPONSE = {
  model: 'qwen3.5:9b',
  created_at: '2026-11-03T21:00:00.000Z',
  response: '{"summary":"ok","moments":[]}',
  done: true,
  total_duration: 1_234_000,
  load_duration: 456_000,
  prompt_eval_count: 5123,
  eval_count: 987,
};

function fakeFetch(body: unknown, init?: { status?: number }) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: init?.status ?? 200 }));
}

describe('ollamaGenerateJson', () => {
  it('sends schema-constrained non-streaming request with keep_alive 0', async () => {
    const f = fakeFetch(RECORDED_RESPONSE);
    const format = { type: 'object', properties: {} };
    await ollamaGenerateJson(
      { baseUrl: 'http://x', model: 'qwen3.5:9b', fetchImpl: f as unknown as typeof fetch },
      { prompt: 'P', format },
    );
    const [url, req] = f.mock.calls[0]!;
    expect(url).toBe('http://x/api/generate');
    const sent = JSON.parse((req as RequestInit).body as string);
    expect(sent).toMatchObject({
      model: 'qwen3.5:9b',
      prompt: 'P',
      format,
      stream: false,
      keep_alive: 0,
      options: { temperature: 0, num_predict: 4096 },
    });
  });

  it('maps usage counters from the response', async () => {
    const f = fakeFetch(RECORDED_RESPONSE);
    const result = await ollamaGenerateJson(
      { baseUrl: 'http://x', model: 'm', fetchImpl: f as unknown as typeof fetch },
      { prompt: 'P', format: {} },
    );
    expect(result.text).toBe(RECORDED_RESPONSE.response);
    expect(result.usage).toEqual({ promptTokens: 5123, completionTokens: 987, totalTokens: 6110 });
  });

  it('throws budget error before calling fetch on oversized prompt', async () => {
    const f = fakeFetch(RECORDED_RESPONSE);
    await expect(
      ollamaGenerateJson(
        { baseUrl: 'http://x', model: 'm', fetchImpl: f as unknown as typeof fetch, maxPromptChars: 10 },
        { prompt: 'x'.repeat(11), format: {} },
      ),
    ).rejects.toMatchObject({ stage: 'budget' });
    expect(f).not.toHaveBeenCalled();
  });

  it('throws ollama error on non-2xx and on body.error', async () => {
    const bad = fakeFetch('model not found', { status: 404 });
    await expect(
      ollamaGenerateJson(
        { baseUrl: 'http://x', model: 'm', fetchImpl: bad as unknown as typeof fetch },
        { prompt: 'P', format: {} },
      ),
    ).rejects.toMatchObject({ stage: 'ollama' });

    const errBody = fakeFetch({ error: 'requires newer version' });
    await expect(
      ollamaGenerateJson(
        { baseUrl: 'http://x', model: 'm', fetchImpl: errBody as unknown as typeof fetch },
        { prompt: 'P', format: {} },
      ),
    ).rejects.toMatchObject({ stage: 'ollama' });
  });

  it('maps AbortError rejections to a timeout-stage error', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const f = vi.fn(async () => Promise.reject(abort));
    await expect(
      ollamaGenerateJson(
        { baseUrl: 'http://x', model: 'm', fetchImpl: f as unknown as typeof fetch, timeoutMs: 5 },
        { prompt: 'P', format: {} },
      ),
    ).rejects.toMatchObject({ stage: 'ollama', message: expect.stringContaining('timed out') });
  });

  it('throws on a response missing the response field', async () => {
    const f = fakeFetch({ done: true });
    await expect(
      ollamaGenerateJson(
        { baseUrl: 'http://x', model: 'm', fetchImpl: f as unknown as typeof fetch },
        { prompt: 'P', format: {} },
      ),
    ).rejects.toMatchObject({ stage: 'ollama' });
  });

  it('throws AnalysisError on fetch rejection', async () => {
    const f = vi.fn(async () => Promise.reject(new Error('ECONNREFUSED')));
    await expect(
      ollamaGenerateJson(
        { baseUrl: 'http://x', model: 'm', fetchImpl: f as unknown as typeof fetch },
        { prompt: 'P', format: {} },
      ),
    ).rejects.toBeInstanceOf(AnalysisError);
  });
});

describe('ollamaModelDigest', () => {
  it('returns the digest of the named model from /api/tags', async () => {
    const f = fakeFetch({
      models: [
        { name: 'other:1b', digest: 'sha256:zzz' },
        { name: 'm', digest: 'sha256:abc123' },
      ],
    });
    const digest = await ollamaModelDigest({
      baseUrl: 'http://x',
      model: 'm',
      fetchImpl: f as unknown as typeof fetch,
    });
    expect(digest).toBe('sha256:abc123');
    expect(f.mock.calls[0]![0]).toBe('http://x/api/tags');
  });

  it('matches a bare repo name against the :latest tag', async () => {
    const f = fakeFetch({ models: [{ name: 'm:latest', digest: 'sha256:l8' }] });
    const digest = await ollamaModelDigest({
      baseUrl: 'http://x',
      model: 'm',
      fetchImpl: f as unknown as typeof fetch,
    });
    expect(digest).toBe('sha256:l8');
  });

  it('returns null when the model is absent or endpoint unavailable', async () => {
    const missing = fakeFetch({ models: [] });
    expect(
      await ollamaModelDigest({ baseUrl: 'http://x', model: 'm', fetchImpl: missing as unknown as typeof fetch }),
    ).toBeNull();
    const down = fakeFetch('nope', { status: 500 });
    expect(
      await ollamaModelDigest({ baseUrl: 'http://x', model: 'm', fetchImpl: down as unknown as typeof fetch }),
    ).toBeNull();
  });
});
