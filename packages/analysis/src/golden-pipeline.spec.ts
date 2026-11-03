import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { analyzeMatch } from './analyze.js';
import { matchV5ToNormalized, type MatchV5Fixture } from './match-v5-mapper.js';
import { computeMetrics } from './metrics.js';
import { detectMoments } from './moment-detection.js';
import { PROMPT_VERSION } from './prompt-builder.js';
import { analysisReportSchema, REPORT_CONTRACT_VERSION, type LlmOutput, type ReportLocale } from './report-contract.js';

/**
 * Golden pipeline tests: committed Match-V5 fixtures -> full pipeline with a
 * deterministic fake LLM -> validated report. No live LLM, no live Riot API.
 * The fake model snapshots the prompt it receives and emits moments equal to
 * the first detected candidates — exercising snap semantics end to end.
 */

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_DIR = resolve(PKG, 'fixtures', 'matches');
const TEMPLATE = readFileSync(resolve(PKG, 'prompts', `v${PROMPT_VERSION}.md`), 'utf8');
const DIGEST = 'sha256:golden-test';

const fixtureFiles = readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

const matches = fixtureFiles.map((file) => {
  const raw = JSON.parse(readFileSync(resolve(FIXTURES_DIR, file), 'utf8')) as MatchV5Fixture;
  return { file, match: matchV5ToNormalized(raw, 'puuid-target') };
});

describe('golden pipeline', () => {
  it('covers every committed Match-V5 fixture', () => {
    // Guard against a silently empty fixtures directory.
    expect(matches.length).toBeGreaterThanOrEqual(9);
  });

  it.each(matches.map((m) => m.match.matchId))(
    'metrics and candidates are deterministic across runs: %s',
    (matchId) => {
      const { match } = matches.find((m) => m.match.matchId === matchId)!;
      expect(computeMetrics(match)).toEqual(computeMetrics(match));
      expect(detectMoments(match)).toEqual(detectMoments(match));
    },
  );

  describe.each(['en', 'pl'] as const)('locale %s', (locale: ReportLocale) => {
    it.each(matches)('analyzeMatch returns a validated report: $file', async ({ match }) => {
      const { candidates } = detectMoments(match);
      const llmOutput: LlmOutput = {
        summary: 'Golden fake summary.',
        topPriority: candidates.length > 0 ? 0 : undefined,
        moments: candidates.slice(0, 3).map((c) => ({
          t_start: c.t_start,
          t_end: c.t_end,
          label: `fake ${c.kind}`,
          mistake: 'fake mistake',
          fix: 'fake fix',
        })),
      };
      const generate = vi.fn(async (req: { prompt: string; format: Record<string, unknown> }) => {
        expect(req.prompt.length).toBeGreaterThan(0);
        expect(req.format).toBeTruthy();
        return {
          text: JSON.stringify(llmOutput),
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        };
      });

      const result = await analyzeMatch(
        { match, locale },
        { template: TEMPLATE, generate, modelDigest: DIGEST, maxRetries: 0 },
      );

      // Schema conformance + metadata provenance.
      const report = analysisReportSchema.parse(result.report);
      expect(report.metadata).toEqual({
        matchId: match.matchId,
        patch: match.patch,
        contractVersion: REPORT_CONTRACT_VERSION,
        promptVersion: PROMPT_VERSION,
        modelDigest: DIGEST,
        locale,
        dataTier: match.dataTier,
      });
      expect(result.retries).toBe(0);
      expect(result.usage.totalTokens).toBe(15);
      expect(generate).toHaveBeenCalledTimes(1);

      // Snap semantics: every moment equals a shown candidate window exactly
      // and lies inside the game duration.
      const windows = new Set(candidates.map((c) => `${c.t_start}:${c.t_end}`));
      for (const m of report.moments) {
        expect(windows.has(`${m.t_start}:${m.t_end}`), 'moment outside candidates').toBe(true);
        expect(m.t_start).toBeGreaterThanOrEqual(0);
        expect(m.t_end).toBeLessThanOrEqual(match.gameDurationMs);
      }
    });
  });

  it('the pipeline is deterministic end to end on identical inputs', async () => {
    const { match } = matches[0]!;
    const { candidates } = detectMoments(match);
    const llmOutput: LlmOutput = {
      summary: 's',
      topPriority: 0,
      moments: candidates.slice(0, 2).map((c) => ({
        t_start: c.t_start,
        t_end: c.t_end,
        label: 'l',
        mistake: 'm',
        fix: 'f',
      })),
    };
    const generate = vi.fn(async () => ({
      text: JSON.stringify(llmOutput),
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }));
    const deps = { template: TEMPLATE, generate, modelDigest: DIGEST, maxRetries: 0 };
    const a = await analyzeMatch({ match, locale: 'en' }, deps);
    const b = await analyzeMatch({ match, locale: 'en' }, deps);
    expect(a.report).toEqual(b.report);
    expect(generate.mock.calls[0]![0].prompt).toBe(generate.mock.calls[1]![0].prompt);
  });
});
