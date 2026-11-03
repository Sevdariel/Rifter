import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { AnalysisError } from './ollama-client.js';
import { analyzeMatch } from './analyze.js';
import { matchV5ToNormalized, type MatchV5Fixture } from './match-v5-mapper.js';
import { detectMoments } from './moment-detection.js';
import { PROMPT_VERSION } from './prompt-builder.js';
import { REPORT_CONTRACT_VERSION } from './report-contract.js';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_DIR = resolve(PKG, 'fixtures', 'matches');

const fixture = (() => {
  const file = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()[0]!;
  const raw = JSON.parse(readFileSync(resolve(FIXTURES_DIR, file), 'utf8'));
  return { match: raw.match, timeline: raw.timeline } as MatchV5Fixture;
})();

const match = matchV5ToNormalized(fixture, 'puuid-target');
const { candidates } = detectMoments(match);
const template = readFileSync(resolve(PKG, 'prompts', `v${PROMPT_VERSION}.md`), 'utf8');

/** A recorded-shape valid LLM output anchored to real candidate windows. */
function validOutput() {
  return {
    summary: 'Solid mid game, died too much early.',
    topPriority: 0,
    moments: candidates.slice(0, 2).map((c) => ({
      t_start: c.t_start,
      t_end: c.t_end,
      label: `window ${c.kind}`,
      mistake: 'positioning',
      fix: 'track jungler',
    })),
  };
}

const deps = (text: string) => ({
  template,
  modelDigest: 'sha256:test',
  generate: vi.fn(async () => ({ text, usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 } })),
});

describe('analyzeMatch', () => {
  it('returns a validated report with pipeline-owned metadata', async () => {
    const d = deps(JSON.stringify(validOutput()));
    const result = await analyzeMatch({ match, locale: 'en' }, d);

    expect(result.retries).toBe(0);
    expect(result.report.metadata).toEqual({
      matchId: match.matchId,
      patch: match.patch,
      contractVersion: REPORT_CONTRACT_VERSION,
      promptVersion: PROMPT_VERSION,
      modelDigest: 'sha256:test',
      locale: 'en',
      dataTier: 'basic',
    });
    expect(result.report.moments).toHaveLength(2);
    expect(result.usage.totalTokens).toBe(150);
    expect(result.timings.totalMs).toBeGreaterThanOrEqual(0);
  });

  it('retries once with validation feedback and succeeds', async () => {
    const bad = JSON.stringify({
      summary: 'x',
      moments: [{ t_start: 1, t_end: 2, label: 'l', mistake: 'm', fix: 'f' }],
    });
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ text: bad, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } })
      .mockResolvedValueOnce({
        text: JSON.stringify(validOutput()),
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      });
    const result = await analyzeMatch({ match, locale: 'en' }, { template, modelDigest: 'd', generate });

    expect(result.retries).toBe(1);
    expect(generate).toHaveBeenCalledTimes(2);
    const retryPrompt = (generate.mock.calls[1]![0] as { prompt: string }).prompt;
    expect(retryPrompt).toContain('Correction required');
    expect(retryPrompt).toContain('does not equal any provided candidate window');
    expect(result.usage.totalTokens).toBe(4);
  });

  it('throws AnalysisError after the retry budget is spent', async () => {
    const bad = JSON.stringify({
      summary: 'x',
      moments: [{ t_start: 1, t_end: 2, label: 'l', mistake: 'm', fix: 'f' }],
    });
    const generate = vi.fn(async () => ({
      text: bad,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    }));
    await expect(analyzeMatch({ match, locale: 'en' }, { template, modelDigest: 'd', generate })).rejects.toMatchObject(
      {
        name: 'AnalysisError',
        stage: 'output',
      },
    );
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('treats unparseable output as a validation failure, not a crash', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({
        text: 'not json at all',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify(validOutput()),
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      });
    const result = await analyzeMatch({ match, locale: 'en' }, { template, modelDigest: 'd', generate });
    expect(result.retries).toBe(1);
    expect((generate.mock.calls[1]![0] as { prompt: string }).prompt).toContain('not valid JSON');
  });

  it('respects maxRetries: 0', async () => {
    const generate = vi.fn(async () => ({
      text: 'x',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    }));
    await expect(
      analyzeMatch({ match, locale: 'en' }, { template, modelDigest: 'd', generate, maxRetries: 0 }),
    ).rejects.toBeInstanceOf(AnalysisError);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
