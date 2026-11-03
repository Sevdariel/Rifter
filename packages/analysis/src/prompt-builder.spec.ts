import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { matchV5ToNormalized, type MatchV5Fixture } from './match-v5-mapper.js';
import { computeMetrics } from './metrics.js';
import { detectMoments } from './moment-detection.js';
import { buildPrompt, PROMPT_VERSION } from './prompt-builder.js';

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
const metrics = computeMetrics(match);
const { candidates } = detectMoments(match);
const template = readFileSync(resolve(PKG, 'prompts', `v${PROMPT_VERSION}.md`), 'utf8');

describe('buildPrompt', () => {
  it.each(['en', 'pl'] as const)('matches the golden output for locale %s', async (locale) => {
    const { prompt } = buildPrompt({ match, metrics, candidates, locale, template });
    await expect(prompt).toMatchFileSnapshot(resolve(PKG, 'prompts', 'golden', `v${PROMPT_VERSION}.${locale}.txt`));
  });

  it('embeds the template verbatim and stamps version + locale', () => {
    const built = buildPrompt({ match, metrics, candidates, locale: 'en', template });
    expect(built.prompt.startsWith(template.trimEnd())).toBe(true);
    expect(built.promptVersion).toBe(PROMPT_VERSION);
    expect(built.locale).toBe('en');
    expect(built.prompt).toContain('in English');
    expect(buildPrompt({ match, metrics, candidates, locale: 'pl', template }).prompt).toContain('in Polish');
  });

  it('carries exact millisecond timestamps so snap validation can match', () => {
    const { prompt } = buildPrompt({ match, metrics, candidates, locale: 'en', template });
    for (const c of candidates) {
      expect(prompt).toContain(`t_start=${c.t_start} t_end=${c.t_end}`);
    }
  });

  it('contains no player identities — only TARGET, team side, role, champion', () => {
    const { prompt } = buildPrompt({ match, metrics, candidates, locale: 'en', template });
    expect(prompt).toContain('TARGET');
    expect(prompt).not.toMatch(/puuid|summoner|Player\d|riotId|gameName|tagLine/i);
  });

  it('renders an empty candidates section without crashing', () => {
    const { prompt } = buildPrompt({ match, metrics, candidates: [], locale: 'en', template });
    expect(prompt).toContain('## Moment candidates');
  });

  it('includes events on the exact window boundaries', () => {
    const [first, second] = match.events;
    const c = {
      t_start: first!.event.timestampMs,
      t_end: second!.event.timestampMs,
      kind: 'death' as const,
      anchorEventId: first!.id,
    };
    const { prompt } = buildPrompt({ match, metrics, candidates: [c], locale: 'en', template });
    for (const e of [first!, second!]) {
      const mm = String(Math.floor(e.event.timestampMs / 60000)).padStart(2, '0');
      const ss = String(Math.floor((e.event.timestampMs % 60000) / 1000)).padStart(2, '0');
      expect(prompt).toContain(`${mm}:${ss}`);
    }
  });

  it('stays within the prompt budget on the committed fixture', () => {
    const { prompt } = buildPrompt({ match, metrics, candidates, locale: 'en', template });
    // ~8k tokens at ~4 chars/token — the agreed per-analysis prompt budget.
    expect(prompt.length).toBeLessThan(32_000);
  });

  it('caps candidates and notes the overflow deterministically', async () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      t_start: i * 10_000,
      t_end: i * 10_000 + 5_000,
      kind: 'death' as const,
      anchorEventId: 'evt-0',
    }));
    const { prompt } = buildPrompt({ match, metrics, candidates: many, locale: 'en', template });
    expect(prompt).toContain('10 further candidates omitted');
    expect((prompt.match(/t_start=/g) ?? []).length).toBe(40);
  });

  it('is deterministic for identical input', () => {
    const a = buildPrompt({ match, metrics, candidates, locale: 'en', template });
    const b = buildPrompt({ match, metrics, candidates, locale: 'en', template });
    expect(a.prompt).toBe(b.prompt);
  });

  it('renders null metrics as unavailable, never the string null', () => {
    const broken = { ...metrics, csPerMin: null, goldDiffAt15: null };
    const { prompt } = buildPrompt({ match, metrics: broken, candidates, locale: 'en', template });
    expect(prompt).toContain('CS/min: unavailable');
    expect(prompt).not.toContain(': null');
  });
});
