import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { matchV5ToNormalized, type MatchV5Fixture } from './match-v5-mapper.js';
import { normalizedMatchSchema, type NormalizedMatch } from './normalized-match.js';

const FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'matches');

function loadFixtures(): { matchId: string; fixture: MatchV5Fixture }[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const raw = JSON.parse(readFileSync(resolve(FIXTURES_DIR, f), 'utf8'));
      return { matchId: raw.matchId, fixture: { match: raw.match, timeline: raw.timeline } };
    });
}

const fixtures = loadFixtures();

function toNormalized({ fixture }: { fixture: MatchV5Fixture }): NormalizedMatch {
  return matchV5ToNormalized(fixture, 'puuid-target');
}

describe('matchV5ToNormalized', () => {
  it.each(fixtures.map((f) => [f.matchId, f]))('%s produces a schema-valid match', (_id, f) => {
    const normalized = toNormalized(f);
    expect(normalizedMatchSchema.safeParse(normalized).success).toBe(true);
    expect(normalized.matchId).toBe(_id);
    expect(normalized.dataTier).toBe('basic');
  });

  it.each(fixtures.map((f) => [f.matchId, f]))('%s marks exactly one target', (_id, f) => {
    const normalized = toNormalized(f);
    const targets = normalized.participants.filter((p) => p.isTarget);
    expect(targets).toHaveLength(1);
    expect(normalized.targetParticipantId).toBe(targets[0]!.participantId);
  });

  it.each(fixtures.map((f) => [f.matchId, f]))('%s carries no identity fields', (_id, f) => {
    const normalized = toNormalized(f);
    const json = JSON.stringify(normalized);
    for (const field of ['puuid', 'summonerId', 'summonerName', 'riotIdGameName', 'accountId']) {
      expect(json).not.toContain(`"${field}"`);
    }
    expect(json).not.toContain('TargetPlayer');
    expect(json).not.toContain('puuid-target');
  });

  it.each(fixtures.map((f) => [f.matchId, f]))('%s has sane structural invariants', (_id, f) => {
    const normalized = toNormalized(f);
    expect(normalized.participants).toHaveLength(10);
    expect(normalized.frames.length).toBeGreaterThan(0);
    expect(normalized.gameDurationMs).toBeGreaterThan(0);
    // events sorted and stably tagged
    for (let i = 1; i < normalized.events.length; i++) {
      expect(normalized.events[i]!.event.timestampMs).toBeGreaterThanOrEqual(
        normalized.events[i - 1]!.event.timestampMs,
      );
    }
    expect(normalized.events[0]!.id).toBe('evt-0');
    // every fixture has at least one champion kill and one frame with 10 participants
    expect(normalized.events.some((e) => e.event.kind === 'champion-kill')).toBe(true);
    expect(normalized.frames[0]!.participants).toHaveLength(10);
  });

  it('keeps all 10 participants but strips identity to role/team/stats', () => {
    const normalized = toNormalized(fixtures[0]!);
    for (const p of normalized.participants) {
      expect(Object.keys(p).sort()).toEqual(
        ['championId', 'championName', 'isTarget', 'participantId', 'position', 'stats', 'team', 'win'].sort(),
      );
    }
  });

  it('maps real controlWardsPlaced from challenges (non-zero on fixtures)', () => {
    const normalized = toNormalized(fixtures[0]!);
    const totalControlWards = normalized.participants.reduce((sum, p) => sum + p.stats.controlWardsPlaced, 0);
    expect(totalControlWards).toBeGreaterThan(0);
  });

  it('carries assists and team attribution on objective events', () => {
    const normalized = toNormalized(fixtures[fixtures.length - 1]!);
    const monsters = normalized.events.filter((e) => e.event.kind === 'monster-kill');
    const buildings = normalized.events.filter((e) => e.event.kind === 'building-kill');
    expect(monsters.length).toBeGreaterThan(0);
    expect(buildings.length).toBeGreaterThan(0);
    for (const e of monsters) {
      if (e.event.kind !== 'monster-kill') continue;
      expect(e.event.killerTeam === undefined || /^(blue|red)$/.test(e.event.killerTeam)).toBe(true);
      expect(Array.isArray(e.event.assistingIds)).toBe(true);
    }
    for (const e of buildings) {
      if (e.event.kind !== 'building-kill') continue;
      expect(e.event.ownerTeam).toMatch(/^(blue|red)$/);
    }
    expect(monsters.some((e) => e.event.kind === 'monster-kill' && e.event.assistingIds.length > 0)).toBe(true);
  });

  it('maps unattributed monster kills (killerTeamId 300) to undefined killerTeam', () => {
    let sawNeutral = false;
    let sawTeam = false;
    for (const f of fixtures) {
      const normalized = toNormalized(f);
      for (const frame of f.fixture.timeline.info.frames) {
        for (const raw of frame.events ?? []) {
          if (raw.type !== 'ELITE_MONSTER_KILL') continue;
          const match = normalized.events.find(
            (e) => e.event.kind === 'monster-kill' && e.event.timestampMs === raw.timestamp,
          );
          if (raw.killerTeamId === 300) {
            sawNeutral = true;
            expect(match?.event.kind === 'monster-kill' && match.event.killerTeam === undefined).toBe(true);
          } else if (raw.killerTeamId === 100 || raw.killerTeamId === 200) {
            sawTeam = true;
          }
        }
      }
    }
    expect(sawNeutral).toBe(true);
    expect(sawTeam).toBe(true);
  });

  it('maps non-champion killers to undefined', () => {
    for (const f of fixtures) {
      const normalized = toNormalized(f);
      const minionKills = normalized.events.filter(
        (e) => e.event.kind === 'building-kill' && e.event.killerId === undefined,
      );
      if (minionKills.length > 0) {
        expect(minionKills[0]!.event.ownerTeam).toMatch(/^(blue|red)$/);
        return;
      }
    }
    throw new Error('no fixture exercised killerId=0 on a building kill');
  });

  it('emits frames in ascending timestamp order', () => {
    for (const f of fixtures) {
      const normalized = toNormalized(f);
      const timestamps = normalized.frames.map((fr) => fr.timestampMs);
      expect([...timestamps].sort((a, b) => a - b)).toEqual(timestamps);
    }
  });

  it('sorts frames even when the source payload is out of order', () => {
    const f = fixtures[0]!.fixture;
    const shuffled: MatchV5Fixture = {
      match: f.match,
      timeline: {
        info: { frames: [...f.timeline.info.frames].reverse() },
      },
    };
    const normalized = matchV5ToNormalized(shuffled, 'puuid-target');
    const timestamps = normalized.frames.map((fr) => fr.timestampMs);
    expect([...timestamps].sort((a, b) => a - b)).toEqual(timestamps);
  });

  it('rejects an unsorted frames array at the schema boundary', () => {
    const normalized = toNormalized(fixtures[0]!);
    const tampered = { ...normalized, frames: [...normalized.frames].reverse() };
    expect(normalizedMatchSchema.safeParse(tampered).success).toBe(false);
  });

  it('converts gameDuration seconds to milliseconds', () => {
    const f = fixtures[0]!;
    const normalized = toNormalized(f);
    expect(normalized.gameDurationMs).toBe(f.fixture.match.info.gameDuration * 1000);
  });

  it('throws when the target is not among participants', () => {
    expect(() => matchV5ToNormalized(fixtures[0]!.fixture, 'missing-puuid')).toThrow('not found');
  });

  it('maps champion kills to victim/killer/assists', () => {
    const normalized = toNormalized(fixtures[0]!);
    const kill = normalized.events.find((e) => e.event.kind === 'champion-kill');
    expect(kill).toBeDefined();
    if (kill?.event.kind === 'champion-kill') {
      expect(kill.event.victimId).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(kill.event.assistingIds)).toBe(true);
    }
  });
});
