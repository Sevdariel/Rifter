import {
  normalizedMatchSchema,
  type LanePosition,
  type NormalizedEventKind,
  type NormalizedMatch,
  type TeamSide,
} from './normalized-match.js';

/**
 * Minimal structural views of the Match-V5 payloads the mapper consumes —
 * only the fields actually used. Raw payloads carry many more fields;
 * identity fields are read only to locate the target, never copied out.
 */

export interface MatchV5ParticipantInfo {
  participantId: number;
  puuid?: string;
  teamId: number;
  championId: number;
  championName: string;
  individualPosition?: string;
  teamPosition?: string;
  kills: number;
  deaths: number;
  assists: number;
  totalDamageDealtToChampions: number;
  visionScore: number;
  wardsPlaced: number;
  goldEarned: number;
  champLevel: number;
  win: boolean;
  challenges?: { controlWardsPlaced?: number };
}

export interface MatchV5Match {
  metadata: { matchId: string };
  info: {
    queueId: number;
    gameVersion: string;
    /** Game length in seconds (Match-V5 convention). */
    gameDuration: number;
    participants: MatchV5ParticipantInfo[];
  };
}

export interface MatchV5FrameParticipant {
  participantId: number;
  totalGold: number;
  minionsKilled: number;
  jungleMinionsKilled: number;
  xp: number;
  position?: { x: number; y: number };
}

export interface MatchV5TimelineEvent {
  type: string;
  timestamp: number;
  [key: string]: unknown;
}

export interface MatchV5TimelineFrame {
  timestamp: number;
  participantFrames: Record<string, MatchV5FrameParticipant>;
  events?: MatchV5TimelineEvent[];
}

export interface MatchV5Timeline {
  info: { frames: MatchV5TimelineFrame[] };
}

export interface MatchV5Fixture {
  match: MatchV5Match;
  timeline: MatchV5Timeline;
}

const LANE_POSITIONS = new Set(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);

/** Participant ids are 1-10; Match-V5 uses 0/absent for non-champion killers. */
function pidOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && value >= 1 && value <= 10 ? value : undefined;
}

function toTeamSide(teamId: number): TeamSide {
  if (teamId === 100) return 'blue';
  if (teamId === 200) return 'red';
  throw new Error(`unexpected teamId ${teamId}`);
}

function toLanePosition(p: MatchV5ParticipantInfo): LanePosition {
  const raw = (p.teamPosition || p.individualPosition || '').toUpperCase();
  return LANE_POSITIONS.has(raw) ? (raw as LanePosition) : 'UNKNOWN';
}

function toNormalizedEvent(event: MatchV5TimelineEvent): NormalizedEventKind | null {
  switch (event.type) {
    case 'CHAMPION_KILL':
      return {
        kind: 'champion-kill',
        timestampMs: event.timestamp,
        killerId: pidOrUndefined(event.killerId),
        victimId: event.victimId as number,
        assistingIds: (event.assistingParticipantIds as number[]) ?? [],
        position: event.position as { x: number; y: number } | undefined,
      };
    case 'ELITE_MONSTER_KILL':
      return {
        kind: 'monster-kill',
        timestampMs: event.timestamp,
        killerId: pidOrUndefined(event.killerId),
        killerTeam: toTeamSide(event.killerTeamId as number),
        assistingIds: (event.assistingParticipantIds as number[]) ?? [],
        monsterType: event.monsterType as string,
        monsterSubType: event.monsterSubType as string | undefined,
        position: event.position as { x: number; y: number } | undefined,
      };
    case 'BUILDING_KILL':
      return {
        kind: 'building-kill',
        timestampMs: event.timestamp,
        killerId: pidOrUndefined(event.killerId),
        ownerTeam: toTeamSide(event.teamId as number),
        assistingIds: (event.assistingParticipantIds as number[]) ?? [],
        buildingType: event.buildingType as string,
        laneType: event.laneType as string | undefined,
        towerType: event.towerType as string | undefined,
        position: event.position as { x: number; y: number } | undefined,
      };
    case 'WARD_PLACED':
      return {
        kind: 'ward-placed',
        timestampMs: event.timestamp,
        creatorId: pidOrUndefined(event.creatorId),
        wardType: event.wardType as string,
      };
    default:
      return null;
  }
}

/**
 * Maps raw Match-V5 match + timeline into the canonical NormalizedMatch.
 * `targetPuuid` identifies the analyzed player (use 'puuid-target' for
 * sanitized fixtures). Identity fields are never copied into the output.
 * Output is validated against `normalizedMatchSchema` — a shape violation
 * throws rather than propagating silently.
 */
export function matchV5ToNormalized(input: MatchV5Fixture, targetPuuid: string): NormalizedMatch {
  const { match, timeline } = input;

  const participants = match.info.participants.map((p) => ({
    participantId: p.participantId,
    team: toTeamSide(p.teamId),
    championId: p.championId,
    championName: p.championName,
    position: toLanePosition(p),
    isTarget: p.puuid === targetPuuid,
    stats: {
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      damageDealtToChampions: p.totalDamageDealtToChampions,
      visionScore: p.visionScore,
      wardsPlaced: p.wardsPlaced,
      controlWardsPlaced: p.challenges?.controlWardsPlaced ?? 0,
      goldEarned: p.goldEarned,
      champLevel: p.champLevel,
    },
    win: p.win,
  }));

  const target = participants.find((p) => p.isTarget);
  if (!target) {
    throw new Error(`target puuid '${targetPuuid}' not found among participants`);
  }

  const frames = timeline.info.frames.map((frame) => ({
    timestampMs: frame.timestamp,
    participants: Object.values(frame.participantFrames).map((pf) => ({
      participantId: pf.participantId,
      gold: pf.totalGold,
      cs: pf.minionsKilled + pf.jungleMinionsKilled,
      xp: pf.xp,
      position: pf.position,
    })),
  }));

  const events = timeline.info.frames
    .flatMap((frame) => frame.events ?? [])
    .map(toNormalizedEvent)
    .filter((e): e is NormalizedEventKind => e !== null)
    .sort((a, b) => a.timestampMs - b.timestampMs)
    .map((event, index) => ({ id: `evt-${index}`, event }));

  return normalizedMatchSchema.parse({
    matchId: match.metadata.matchId,
    queueId: match.info.queueId,
    patch: match.info.gameVersion,
    gameDurationMs: match.info.gameDuration * 1000,
    dataTier: 'basic',
    targetParticipantId: target.participantId,
    participants,
    frames,
    events,
  });
}
