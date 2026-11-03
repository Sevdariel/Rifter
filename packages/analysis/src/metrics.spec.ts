import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { matchV5ToNormalized, type MatchV5Fixture } from './match-v5-mapper.js';
import { computeMetrics } from './metrics.js';
import type { NormalizedMatch } from './normalized-match.js';

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

describe('computeMetrics on real fixtures', () => {
  it('has committed fixtures to run against', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures.map((f) => [f.matchId, f]))('%s computes honest basic-tier metrics', (_id, f) => {
    const match = normalized(f.fixture);
    const metrics = computeMetrics(match);
    const target = match.participants.find((p) => p.isTarget)!;
    const teammates = match.participants.filter((p) => p.team === target.team);

    expect(metrics.minTier).toBe('basic');

    expect(metrics.csPerMin).not.toBeNull();
    expect(metrics.csPerMin!).toBeGreaterThanOrEqual(0);
    expect(metrics.csPerMin!).toBeLessThan(30);

    const teamKills = teammates.reduce((s, p) => s + p.stats.kills, 0);
    if (teamKills > 0) {
      expect(metrics.killParticipation).not.toBeNull();
      expect(metrics.killParticipation!).toBeGreaterThanOrEqual(0);
      expect(metrics.killParticipation!).toBeLessThanOrEqual(1);
    }

    const teamDamage = teammates.reduce((s, p) => s + p.stats.damageDealtToChampions, 0);
    if (teamDamage > 0) {
      expect(metrics.damageShare).not.toBeNull();
      expect(metrics.damageShare!).toBeGreaterThan(0);
      expect(metrics.damageShare!).toBeLessThanOrEqual(1);
    }

    expect(metrics.visionScore).toBe(target.stats.visionScore);
    expect(metrics.visionPerMin).toBeCloseTo(target.stats.visionScore / (match.gameDurationMs / 60_000), 6);

    if (metrics.goldDiffAt15 !== null) {
      expect(Number.isFinite(metrics.goldDiffAt15)).toBe(true);
      expect(Math.abs(metrics.goldDiffAt15)).toBeLessThan(20_000);
    }

    const timestamps = metrics.deaths.map((d) => d.timestampMs);
    expect([...timestamps].sort((a, b) => a - b)).toEqual(timestamps);
    for (const d of metrics.deaths) {
      expect(d.timestampMs).toBeLessThanOrEqual(match.gameDurationMs);
    }
    expect(metrics.deathPhases.early + metrics.deathPhases.mid + metrics.deathPhases.late).toBe(metrics.deaths.length);

    expect(metrics.objectives.participated).toBeLessThanOrEqual(metrics.objectives.teamObjectives);
    if (metrics.objectives.teamObjectives > 0) {
      expect(metrics.objectives.share).not.toBeNull();
      expect(metrics.objectives.share!).toBeGreaterThanOrEqual(0);
      expect(metrics.objectives.share!).toBeLessThanOrEqual(1);
    }
  });

  it('recomputes csPerMin from the last frame, not end-of-game stats', () => {
    const match = normalized(fixtures[0]!.fixture);
    const metrics = computeMetrics(match);
    const last = match.frames[match.frames.length - 1]!;
    const cs = last.participants.find((p) => p.participantId === match.targetParticipantId)!.cs;
    expect(metrics.csPerMin).toBeCloseTo(cs / (last.timestampMs / 60_000), 6);
  });

  it('anchors goldDiffAt15 to the frame at or before minute 15', () => {
    const match = normalized(fixtures[0]!.fixture);
    const metrics = computeMetrics(match);
    const target = match.participants.find((p) => p.isTarget)!;
    const frame = [...match.frames].reverse().find((fr) => fr.timestampMs <= 900_000)!;
    const opponent = match.participants.find((p) => p.team !== target.team && p.position === target.position);
    if (target.position !== 'UNKNOWN' && opponent) {
      const mine = frame.participants.find((p) => p.participantId === target.participantId)!.gold;
      const theirs = frame.participants.find((p) => p.participantId === opponent.participantId)!.gold;
      expect(metrics.goldDiffAt15).toBe(mine - theirs);
    } else {
      expect(metrics.goldDiffAt15).toBeNull();
    }
  });
});

describe('computeMetrics edge cases', () => {
  const base: NormalizedMatch = {
    matchId: 'SYNTH_1',
    queueId: 420,
    patch: '15.1.1',
    gameDurationMs: 1_800_000,
    dataTier: 'basic',
    targetParticipantId: 1,
    participants: [
      {
        participantId: 1,
        team: 'blue',
        championId: 1,
        championName: 'A',
        position: 'MIDDLE',
        isTarget: true,
        win: true,
        stats: {
          kills: 2,
          deaths: 1,
          assists: 3,
          damageDealtToChampions: 10_000,
          visionScore: 30,
          wardsPlaced: 10,
          controlWardsPlaced: 2,
          goldEarned: 12_000,
          champLevel: 15,
        },
      },
      {
        participantId: 6,
        team: 'red',
        championId: 2,
        championName: 'B',
        position: 'MIDDLE',
        isTarget: false,
        win: false,
        stats: {
          kills: 1,
          deaths: 2,
          assists: 0,
          damageDealtToChampions: 8_000,
          visionScore: 20,
          wardsPlaced: 8,
          controlWardsPlaced: 1,
          goldEarned: 10_000,
          champLevel: 14,
        },
      },
    ],
    frames: [],
    events: [],
  };

  it('returns nulls instead of fabricating when frames are missing', () => {
    const metrics = computeMetrics(base);
    expect(metrics.csPerMin).toBeNull();
    expect(metrics.goldDiffAt15).toBeNull();
    expect(metrics.visionPerMin).toBeCloseTo(30 / 30, 6);
  });

  it('returns null killParticipation when the team has zero kills', () => {
    const metrics = computeMetrics({
      ...base,
      participants: base.participants.map((p) => ({ ...p, stats: { ...p.stats, kills: 0, assists: 0 } })),
    });
    expect(metrics.killParticipation).toBeNull();
  });

  it('returns null goldDiffAt15 when the target position is UNKNOWN', () => {
    const match: NormalizedMatch = {
      ...base,
      frames: [
        {
          timestampMs: 900_000,
          participants: [
            { participantId: 1, gold: 6000, cs: 100, xp: 8000 },
            { participantId: 6, gold: 5500, cs: 90, xp: 7500 },
          ],
        },
      ],
      participants: base.participants.map((p) => ({ ...p, position: 'UNKNOWN' as const })),
    };
    expect(computeMetrics(match).goldDiffAt15).toBeNull();
  });

  it('credits objectives via killer team fallback when killerTeam is absent', () => {
    const match: NormalizedMatch = {
      ...base,
      events: [
        {
          id: 'evt-0',
          event: {
            kind: 'monster-kill',
            timestampMs: 600_000,
            killerId: 1,
            killerTeam: undefined,
            assistingIds: [],
            monsterType: 'DRAGON',
          },
        },
      ],
    };
    const metrics = computeMetrics(match);
    expect(metrics.objectives.teamObjectives).toBe(1);
    expect(metrics.objectives.participated).toBe(1);
    expect(metrics.objectives.share).toBe(1);
  });

  it('does not credit neutral or enemy objectives to the target team', () => {
    const match: NormalizedMatch = {
      ...base,
      events: [
        {
          id: 'evt-0',
          event: {
            kind: 'monster-kill',
            timestampMs: 600_000,
            killerId: undefined,
            killerTeam: undefined,
            assistingIds: [],
            monsterType: 'DRAGON',
          },
        },
        {
          id: 'evt-1',
          event: {
            kind: 'monster-kill',
            timestampMs: 700_000,
            killerId: 6,
            killerTeam: 'red',
            assistingIds: [1],
            monsterType: 'BARON_NASHOR',
          },
        },
        {
          id: 'evt-2',
          event: {
            kind: 'building-kill',
            timestampMs: 800_000,
            killerId: 1,
            ownerTeam: 'blue',
            assistingIds: [],
            buildingType: 'TOWER_BUILDING',
          },
        },
      ],
    };
    const metrics = computeMetrics(match);
    // Neutral kill and enemy baron are not team objectives; a lost tower is
    // secured by the enemy (ownerTeam blue = blue lost it, target is blue).
    expect(metrics.objectives.teamObjectives).toBe(0);
    expect(metrics.objectives.share).toBeNull();
  });

  it('returns null damageShare when team damage is zero', () => {
    const metrics = computeMetrics({
      ...base,
      participants: base.participants.map((p) => ({
        ...p,
        stats: { ...p.stats, damageDealtToChampions: 0 },
      })),
    });
    expect(metrics.damageShare).toBeNull();
  });

  it('credits own-team building destruction and target participation', () => {
    const match: NormalizedMatch = {
      ...base,
      events: [
        {
          id: 'evt-0',
          event: {
            kind: 'building-kill',
            timestampMs: 600_000,
            killerId: 1,
            ownerTeam: 'red',
            assistingIds: [],
            buildingType: 'TOWER_BUILDING',
          },
        },
      ],
    };
    const metrics = computeMetrics(match);
    expect(metrics.objectives.byKind.building).toEqual({ secured: 1, participated: 1 });
    expect(metrics.objectives.teamObjectives).toBe(1);
  });

  it('assigns phase boundaries correctly (15:00 mid, 25:00 late)', () => {
    const kill = (timestampMs: number) => ({
      kind: 'champion-kill' as const,
      timestampMs,
      killerId: 6,
      victimId: 1,
      assistingIds: [],
    });
    const match: NormalizedMatch = {
      ...base,
      events: [
        { id: 'e1', event: kill(899_999) },
        { id: 'e2', event: kill(900_000) },
        { id: 'e3', event: kill(1_499_999) },
        { id: 'e4', event: kill(1_500_000) },
      ],
    };
    expect(computeMetrics(match).deathPhases).toEqual({ early: 1, mid: 2, late: 1 });
  });

  it('throws when no participant is marked target', () => {
    const match: NormalizedMatch = {
      ...base,
      participants: base.participants.map((p) => ({ ...p, isTarget: false })),
    };
    expect(() => computeMetrics(match)).toThrow('no target participant');
  });
});
