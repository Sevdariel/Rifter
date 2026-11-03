import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ALLOWED_QUEUES, buildIdentityMap, sanitizeMatch, sanitizeTimeline } from '../scripts/fetch-fixtures.mjs';

const FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'matches');

const PLACEHOLDER =
  /^(puuid-\d+|puuid-target|puuid-x|Player\d+|TargetPlayer|PlayerX|TAG|summoner-\d+|summoner-target|summoner-x)$/;
const IDENTITY_FIELDS = ['puuid', 'accountId', 'summonerId', 'summonerName', 'riotIdGameName', 'riotIdTagline'];

function loadFixtures() {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(resolve(FIXTURES_DIR, f), 'utf8')));
}

function* identityValues(obj) {
  if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      if (IDENTITY_FIELDS.includes(key) && typeof value === 'string' && value !== '') {
        yield value;
      }
      if (key === 'participants' && Array.isArray(value) && value.every((v) => typeof v === 'string')) {
        yield* value;
      }
      yield* identityValues(value);
    }
  }
}

describe('committed fixtures', () => {
  const fixtures = loadFixtures();

  it('contains at least 5 sanitized matches', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(5);
  });

  it.each(fixtures.map((f) => [f.matchId, f]))('%s is from an allowed queue', (_id, fixture) => {
    expect(ALLOWED_QUEUES.has(fixture.queueId)).toBe(true);
    expect(fixture.match.info.queueId).toBe(fixture.queueId);
  });

  it.each(fixtures.map((f) => [f.matchId, f]))('%s carries a marked target player', (_id, fixture) => {
    expect(fixture.match.metadata.participants).toContain('puuid-target');
    expect(fixture.match.info.participants.some((p) => p.puuid === 'puuid-target')).toBe(true);
    expect(fixture.timeline.info.participants.some((p) => p.puuid === 'puuid-target')).toBe(true);
  });

  it.each(fixtures.map((f) => [f.matchId, f]))('%s contains no real identity values', (_id, fixture) => {
    for (const value of identityValues(fixture)) {
      expect(value).toMatch(PLACEHOLDER);
    }
  });
});

describe('sanitization', () => {
  const target = 'real-puuid-target';
  const match = {
    metadata: { participants: [target, 'real-puuid-a', 'real-puuid-b'] },
    info: {
      participants: [
        { participantId: 2, puuid: 'real-puuid-a' },
        { participantId: 1, puuid: target },
        { participantId: 3, puuid: 'real-puuid-b' },
      ],
    },
  };
  const map = buildIdentityMap(match, target);

  it('marks the target deterministically and numbers others by participantId', () => {
    expect(map.get(target)).toEqual({
      puuid: 'puuid-target',
      name: 'TargetPlayer',
      summoner: 'summoner-target',
    });
    expect(map.get('real-puuid-a')).toEqual({
      puuid: 'puuid-1',
      name: 'Player1',
      summoner: 'summoner-1',
    });
    expect(map.get('real-puuid-b')).toEqual({
      puuid: 'puuid-2',
      name: 'Player2',
      summoner: 'summoner-2',
    });
  });

  it('strips every identity field from match and timeline', () => {
    const matchWithSummonerId = structuredClone(match);
    matchWithSummonerId.info.participants.forEach((p, i) => {
      p.summonerId = `real-summoner-${i}`;
    });
    const sanitized = sanitizeMatch(matchWithSummonerId, map);
    expect(sanitized.metadata.participants).toEqual(['puuid-target', 'puuid-1', 'puuid-2']);
    expect(sanitized.info.participants[1].riotIdGameName).toBe('TargetPlayer');
    expect(sanitized.info.participants[0].summonerId).toBe('summoner-1');
    expect(sanitized.info.participants[1].summonerId).toBe('summoner-target');
    const timeline = {
      metadata: { participants: [target, 'real-puuid-a', 'real-puuid-b'] },
      info: { participants: [{ participantId: 1, puuid: target }] },
    };
    const sanitizedTimeline = sanitizeTimeline(timeline, map);
    expect(sanitizedTimeline.metadata.participants).toEqual(['puuid-target', 'puuid-1', 'puuid-2']);
    expect(sanitizedTimeline.info.participants[0].puuid).toBe('puuid-target');
  });
});
