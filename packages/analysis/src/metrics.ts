import {
  opposingTeam,
  securingTeam,
  type LanePosition,
  type NormalizedMatch,
  type TeamSide,
} from './normalized-match.js';

/**
 * Deterministic metrics — pure functions on `NormalizedMatch`, never on raw
 * source payloads. Every metric declares its minimum data tier; all v1
 * metrics are computable on `basic` (Match-V5, 60 s frames).
 *
 * Metrics return `null` when the input cannot support an honest value
 * (missing frame, zero denominator, unmatched lane opponent) — never a
 * fabricated number.
 */

export const GOLD_DIFF_MINUTE = 15;
export const EARLY_GAME_END_MS = 15 * 60_000;
export const MID_GAME_END_MS = 25 * 60_000;

export type GamePhase = 'early' | 'mid' | 'late';

export interface DeathTiming {
  timestampMs: number;
  phase: GamePhase;
}

export interface ObjectiveKindSummary {
  secured: number;
  participated: number;
}

export interface ObjectiveSummary {
  /** Objectives secured by the target's team. */
  teamObjectives: number;
  /** Team objectives the target killed or assisted. */
  participated: number;
  /** participated / teamObjectives; null when the team secured none. */
  share: number | null;
  byKind: { monster: ObjectiveKindSummary; building: ObjectiveKindSummary };
}

export interface MatchMetrics {
  /** Minimum data tier every value in this object was computed at. */
  minTier: 'basic';
  csPerMin: number | null;
  /** (kills + assists) / team kills; null when the team had zero kills. */
  killParticipation: number | null;
  visionScore: number;
  visionPerMin: number | null;
  /** Target damage / team damage to champions; null when team damage is 0. */
  damageShare: number | null;
  /**
   * Target gold minus same-position enemy gold at the last frame at or
   * before minute 15; null when no frame, an UNKNOWN position, or no
   * lane opponent exists.
   */
  goldDiffAt15: number | null;
  /** Timestamps of the target's deaths, ascending, with game phase. */
  deaths: DeathTiming[];
  deathPhases: Record<GamePhase, number>;
  objectives: ObjectiveSummary;
}

function phaseOf(timestampMs: number): GamePhase {
  if (timestampMs < EARLY_GAME_END_MS) return 'early';
  if (timestampMs < MID_GAME_END_MS) return 'mid';
  return 'late';
}

function lastFrameAtOrBefore(match: NormalizedMatch, limitMs: number) {
  let found: NormalizedMatch['frames'][number] | undefined;
  for (const frame of match.frames) {
    if (frame.timestampMs > limitMs) break;
    found = frame;
  }
  return found;
}

function computeObjectives(match: NormalizedMatch, targetId: number, team: TeamSide): ObjectiveSummary {
  const byKind: ObjectiveSummary['byKind'] = {
    monster: { secured: 0, participated: 0 },
    building: { secured: 0, participated: 0 },
  };
  const teamById = new Map(match.participants.map((p) => [p.participantId, p.team]));

  for (const { event } of match.events) {
    let securing: TeamSide | undefined;
    let kind: keyof ObjectiveSummary['byKind'] | undefined;

    if (event.kind === 'monster-kill') {
      securing = securingTeam(event, teamById);
      kind = 'monster';
    } else if (event.kind === 'building-kill') {
      securing = opposingTeam(event.ownerTeam);
      kind = 'building';
    } else {
      continue;
    }

    if (securing !== team) continue;
    const summary = byKind[kind];
    summary.secured += 1;
    if (event.killerId === targetId || event.assistingIds.includes(targetId)) {
      summary.participated += 1;
    }
  }

  const teamObjectives = byKind.monster.secured + byKind.building.secured;
  const participated = byKind.monster.participated + byKind.building.participated;
  return {
    teamObjectives,
    participated,
    share: teamObjectives > 0 ? participated / teamObjectives : null,
    byKind,
  };
}

/** All v1 metrics for the target player of one normalized match. */
export function computeMetrics(match: NormalizedMatch): MatchMetrics {
  const target = match.participants.find((p) => p.isTarget);
  if (!target) {
    throw new Error('normalized match has no target participant');
  }
  const targetId = target.participantId;
  const teammates = match.participants.filter((p) => p.team === target.team);
  const gameMinutes = match.gameDurationMs / 60_000;

  const lastFrame = match.frames[match.frames.length - 1];
  const targetFrame = lastFrame?.participants.find((p) => p.participantId === targetId);
  const frameMinutes = lastFrame ? lastFrame.timestampMs / 60_000 : 0;
  const csPerMin = targetFrame && frameMinutes > 0 ? targetFrame.cs / frameMinutes : null;

  const teamKills = teammates.reduce((sum, p) => sum + p.stats.kills, 0);
  const killParticipation = teamKills > 0 ? (target.stats.kills + target.stats.assists) / teamKills : null;

  const teamDamage = teammates.reduce((sum, p) => sum + p.stats.damageDealtToChampions, 0);
  const damageShare = teamDamage > 0 ? target.stats.damageDealtToChampions / teamDamage : null;

  let goldDiffAt15: number | null = null;
  if (target.position !== 'UNKNOWN') {
    const opponent = match.participants.find(
      (p) => p.team !== target.team && p.position === (target.position as LanePosition),
    );
    const frame = lastFrameAtOrBefore(match, GOLD_DIFF_MINUTE * 60_000);
    const mine = frame?.participants.find((p) => p.participantId === targetId);
    const theirs = frame?.participants.find((p) => p.participantId === opponent?.participantId);
    if (mine && theirs) {
      goldDiffAt15 = mine.gold - theirs.gold;
    }
  }

  const deaths = match.events.flatMap((e) =>
    e.event.kind === 'champion-kill' && e.event.victimId === targetId
      ? [{ timestampMs: e.event.timestampMs, phase: phaseOf(e.event.timestampMs) }]
      : [],
  );
  const deathPhases: Record<GamePhase, number> = { early: 0, mid: 0, late: 0 };
  for (const d of deaths) deathPhases[d.phase] += 1;

  return {
    minTier: 'basic',
    csPerMin,
    killParticipation,
    visionScore: target.stats.visionScore,
    visionPerMin: gameMinutes > 0 ? target.stats.visionScore / gameMinutes : null,
    damageShare,
    goldDiffAt15,
    deaths,
    deathPhases,
    objectives: computeObjectives(match, targetId, target.team),
  };
}
