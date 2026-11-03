import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { matchV5ToNormalized, type MatchV5Fixture } from './match-v5-mapper.js';
import { detectMoments } from './moment-detection.js';
import type { NormalizedMatch, TimelineEvent } from './normalized-match.js';
import { momentCandidateSchema } from './report-contract.js';

const FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'matches');

const fixtures = readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => {
    const raw = JSON.parse(readFileSync(resolve(FIXTURES_DIR, f), 'utf8'));
    return { matchId: raw.matchId as string, fixture: { match: raw.match, timeline: raw.timeline } as MatchV5Fixture };
  });

function normalized(f: MatchV5Fixture): NormalizedMatch {
  return matchV5ToNormalized(f, 'puuid-target');
}

describe('detectMoments on real fixtures', () => {
  it.each(fixtures.map((f) => [f.matchId, f]))('%s produces schema-valid anchored candidates', (_id, f) => {
    const match = normalized(f.fixture);
    const { minTier, candidates } = detectMoments(match);

    expect(minTier).toBe('basic');
    const eventIds = new Set(match.events.map((e) => e.id));
    const targetDeaths = match.events.filter(
      (e) => e.event.kind === 'champion-kill' && e.event.victimId === match.targetParticipantId,
    ).length;
    const deathCandidates = candidates.filter((c) => c.kind === 'death');

    expect(candidates.length).toBeGreaterThan(0);
    expect(deathCandidates).toHaveLength(targetDeaths);
    for (const c of candidates) {
      expect(momentCandidateSchema.safeParse(c).success).toBe(true);
      expect(c.t_start).toBeGreaterThanOrEqual(0);
      expect(c.t_end).toBeLessThanOrEqual(match.gameDurationMs);
      expect(eventIds.has(c.anchorEventId)).toBe(true);
    }
  });

  it('is deterministic across runs', () => {
    const match = normalized(fixtures[0]!.fixture);
    expect(detectMoments(match)).toEqual(detectMoments(match));
  });

  it('flags only enemy-secured objectives as objective-lost', () => {
    const match = normalized(fixtures[0]!.fixture);
    const { candidates } = detectMoments(match);
    const target = match.participants.find((p) => p.isTarget)!;
    for (const c of candidates.filter((c) => c.kind === 'objective-lost')) {
      const anchor = match.events.find((e) => e.id === c.anchorEventId)!;
      if (anchor.event.kind === 'building-kill') {
        expect(anchor.event.ownerTeam).toBe(target.team);
      } else if (anchor.event.kind === 'monster-kill') {
        expect(anchor.event.killerTeam === undefined || anchor.event.killerTeam !== target.team).toBe(true);
      }
    }
  });
});

describe('detectMoments edge cases', () => {
  const target = {
    participantId: 1,
    team: 'blue' as const,
    championId: 1,
    championName: 'A',
    position: 'MIDDLE' as const,
    isTarget: true,
    win: true,
    stats: {
      kills: 0,
      deaths: 0,
      assists: 0,
      damageDealtToChampions: 0,
      visionScore: 0,
      wardsPlaced: 0,
      controlWardsPlaced: 0,
      goldEarned: 0,
      champLevel: 1,
    },
  };
  const enemy = { ...target, participantId: 6, team: 'red' as const, isTarget: false };
  const base: NormalizedMatch = {
    matchId: 'SYNTH_1',
    queueId: 420,
    patch: '15.1.1',
    gameDurationMs: 1_800_000,
    dataTier: 'basic',
    targetParticipantId: 1,
    participants: [target, enemy],
    frames: [],
    events: [],
  };
  const kill = (id: string, timestampMs: number, victimId = 6): TimelineEvent => ({
    id,
    event: { kind: 'champion-kill', timestampMs, killerId: 1, victimId, assistingIds: [] },
  });

  it('returns empty candidates for an eventless match', () => {
    const { candidates } = detectMoments(base);
    expect(candidates).toEqual([]);
  });

  it('produces a death candidate per target death with exact window', () => {
    const match = { ...base, events: [kill('e1', 300_000, 1), kill('e2', 500_000, 6)] };
    const { candidates } = detectMoments(match);
    const deaths = candidates.filter((c) => c.kind === 'death');
    expect(deaths).toHaveLength(1);
    expect(deaths[0]).toEqual({ t_start: 270_000, t_end: 310_000, kind: 'death', anchorEventId: 'e1' });
  });

  it('clusters kills within the gap into a teamfight anchored at the first kill', () => {
    const match = {
      ...base,
      events: [kill('k1', 100_000), kill('k2', 115_000), kill('k3', 130_000)],
    };
    const { candidates } = detectMoments(match);
    const fights = candidates.filter((c) => c.kind === 'teamfight');
    expect(fights).toHaveLength(1);
    expect(fights[0]).toEqual({ t_start: 90_000, t_end: 145_000, kind: 'teamfight', anchorEventId: 'k1' });
  });

  it('joins kills at exactly the 30 s gap boundary', () => {
    const match = {
      ...base,
      events: [kill('k1', 100_000), kill('k2', 130_000), kill('k3', 160_000)],
    };
    const { candidates } = detectMoments(match);
    expect(candidates.filter((c) => c.kind === 'teamfight')).toHaveLength(1);
  });

  it('flags enemy monster kills via killer team fallback when killerTeam is absent', () => {
    const herald: TimelineEvent = {
      id: 'h1',
      event: {
        kind: 'monster-kill',
        timestampMs: 600_000,
        killerId: 6,
        killerTeam: undefined,
        assistingIds: [],
        monsterType: 'RIFTHERALD',
      },
    };
    const { candidates } = detectMoments({ ...base, events: [herald] });
    expect(candidates).toEqual([{ t_start: 570_000, t_end: 610_000, kind: 'objective-lost', anchorEventId: 'h1' }]);
  });

  it('links a kill at exactly 60 s before the objective, not one at 61 s', () => {
    const tower: TimelineEvent = {
      id: 't1',
      event: {
        kind: 'building-kill',
        timestampMs: 600_000,
        killerId: 6,
        ownerTeam: 'blue',
        assistingIds: [],
        buildingType: 'TOWER_BUILDING',
      },
    };
    const linked = { ...base, events: [kill('k1', 540_000), tower] };
    expect(detectMoments(linked).candidates[0]!.t_start).toBe(530_000);
    const unlinked = { ...base, events: [kill('k1', 539_000), tower] };
    expect(detectMoments(unlinked).candidates[0]!.t_start).toBe(570_000);
  });

  it('sorts candidates by t_start across kinds', () => {
    const tower: TimelineEvent = {
      id: 't1',
      event: {
        kind: 'building-kill',
        timestampMs: 300_000,
        killerId: 6,
        ownerTeam: 'blue',
        assistingIds: [],
        buildingType: 'TOWER_BUILDING',
      },
    };
    const match = { ...base, events: [kill('e1', 800_000, 1), tower] };
    const { candidates } = detectMoments(match);
    expect(candidates[0]!.kind).toBe('objective-lost');
    expect(candidates[1]!.kind).toBe('death');
  });

  it('collapses to a zero-width window for events beyond the game duration', () => {
    const match = { ...base, gameDurationMs: 600_000, events: [kill('e1', 700_000, 1)] };
    const { candidates } = detectMoments(match);
    expect(candidates[0]).toEqual({ t_start: 600_000, t_end: 600_000, kind: 'death', anchorEventId: 'e1' });
  });

  it('splits clusters at gaps over 30 s and ignores sub-3 clusters', () => {
    const match = {
      ...base,
      events: [kill('k1', 100_000), kill('k2', 110_000), kill('k3', 200_000), kill('k4', 210_000)],
    };
    const { candidates } = detectMoments(match);
    expect(candidates.filter((c) => c.kind === 'teamfight')).toHaveLength(0);
  });

  it('flags enemy objectives with a 30 s fallback lookback', () => {
    const dragon: TimelineEvent = {
      id: 'd1',
      event: {
        kind: 'monster-kill',
        timestampMs: 600_000,
        killerId: 6,
        killerTeam: 'red',
        assistingIds: [],
        monsterType: 'DRAGON',
      },
    };
    const { candidates } = detectMoments({ ...base, events: [dragon] });
    expect(candidates).toEqual([{ t_start: 570_000, t_end: 610_000, kind: 'objective-lost', anchorEventId: 'd1' }]);
  });

  it('extends the window over kills preceding the objective (fight context)', () => {
    const tower: TimelineEvent = {
      id: 't1',
      event: {
        kind: 'building-kill',
        timestampMs: 600_000,
        killerId: 6,
        ownerTeam: 'blue',
        assistingIds: [],
        buildingType: 'TOWER_BUILDING',
      },
    };
    const match = { ...base, events: [kill('k1', 550_000), kill('k2', 570_000), tower] };
    const { candidates } = detectMoments(match);
    expect(candidates[0]).toEqual({
      t_start: 540_000,
      t_end: 610_000,
      kind: 'objective-lost',
      anchorEventId: 't1',
    });
  });

  it('ignores own-team and neutral objectives', () => {
    const events: TimelineEvent[] = [
      {
        id: 'n1',
        event: {
          kind: 'monster-kill',
          timestampMs: 100_000,
          killerId: undefined,
          killerTeam: undefined,
          assistingIds: [],
          monsterType: 'DRAGON',
        },
      },
      {
        id: 'o1',
        event: {
          kind: 'monster-kill',
          timestampMs: 200_000,
          killerId: 1,
          killerTeam: 'blue',
          assistingIds: [],
          monsterType: 'BARON_NASHOR',
        },
      },
      {
        id: 'o2',
        event: {
          kind: 'building-kill',
          timestampMs: 300_000,
          killerId: 1,
          ownerTeam: 'red',
          assistingIds: [],
          buildingType: 'TOWER_BUILDING',
        },
      },
    ];
    const { candidates } = detectMoments({ ...base, events });
    expect(candidates.filter((c) => c.kind === 'objective-lost')).toHaveLength(0);
  });

  it('clamps windows to [0, gameDurationMs]', () => {
    const match = { ...base, gameDurationMs: 605_000, events: [kill('e1', 5_000, 1)] };
    const { candidates } = detectMoments(match);
    expect(candidates[0]!.t_start).toBe(0);
    const late = { ...match, events: [kill('e1', 600_000, 1)] };
    const { candidates: lateCandidates } = detectMoments(late);
    expect(lateCandidates[0]!.t_end).toBe(605_000);
  });
});
