import { z } from 'zod';

import { dataTierSchema } from './report-contract.js';

/**
 * NormalizedMatch — the canonical input contract of the analysis pipeline.
 * Every data source (Match-V5 today, Live Client Data and parsed .rofl later)
 * is normalized into this model before any metric or detector runs. Metrics
 * never read raw source payloads.
 *
 * Identity: the target player is fully modeled (`isTarget`); the other nine
 * participants carry role/team/champion/stats only — no puuid, summonerName,
 * riotId, or any real identity field anywhere in the model.
 */

const participantIdSchema = z.number().int().min(1).max(10);
const positionSchema = z.object({ x: z.number(), y: z.number() });

export const teamSideSchema = z.enum(['blue', 'red']);
export type TeamSide = z.infer<typeof teamSideSchema>;

export const lanePositionSchema = z.enum(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY', 'UNKNOWN']);
export type LanePosition = z.infer<typeof lanePositionSchema>;

/** Per-participant end-of-game stats (subset needed by v1 metrics). */
export const participantStatsSchema = z.object({
  kills: z.number().int().nonnegative(),
  deaths: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  damageDealtToChampions: z.number().nonnegative(),
  visionScore: z.number().nonnegative(),
  wardsPlaced: z.number().int().nonnegative(),
  controlWardsPlaced: z.number().int().nonnegative(),
  goldEarned: z.number().nonnegative(),
  champLevel: z.number().int().nonnegative(),
});
export type ParticipantStats = z.infer<typeof participantStatsSchema>;

export const normalizedParticipantSchema = z.object({
  participantId: participantIdSchema,
  team: teamSideSchema,
  championId: z.number().int(),
  championName: z.string().min(1),
  position: lanePositionSchema,
  isTarget: z.boolean(),
  win: z.boolean(),
  stats: participantStatsSchema,
});
export type NormalizedParticipant = z.infer<typeof normalizedParticipantSchema>;

/** Per-participant state sampled at one timeline frame (60 s on basic tier). */
export const frameParticipantSchema = z.object({
  participantId: participantIdSchema,
  gold: z.number().nonnegative(),
  cs: z.number().int().nonnegative(),
  xp: z.number().int().nonnegative(),
  position: positionSchema.optional(),
});
export type FrameParticipant = z.infer<typeof frameParticipantSchema>;

export const normalizedFrameSchema = z.object({
  timestampMs: z.number().int().nonnegative(),
  participants: z.array(frameParticipantSchema),
});
export type NormalizedFrame = z.infer<typeof normalizedFrameSchema>;

/**
 * Timeline events, reduced to what moment detection and metrics consume.
 * `killerId`/`creatorId` are absent when no champion is responsible (e.g. a
 * building finished by minions). `assistingIds` carries Match-V5
 * `assistingParticipantIds` where present. Team attribution stays explicit:
 * `killerTeam` on monster kills (absent when the kill has no team
 * attribution, e.g. Match-V5 `killerTeamId` 300), `ownerTeam` (the side
 * that lost the building) on building kills — needed for
 * `objective-lost` detection when the killer is absent.
 */
export const normalizedEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('champion-kill'),
    timestampMs: z.number().int().nonnegative(),
    killerId: participantIdSchema.optional(),
    victimId: participantIdSchema,
    assistingIds: z.array(participantIdSchema),
    position: positionSchema.optional(),
  }),
  z.object({
    kind: z.literal('monster-kill'),
    timestampMs: z.number().int().nonnegative(),
    killerId: participantIdSchema.optional(),
    killerTeam: teamSideSchema.optional(),
    assistingIds: z.array(participantIdSchema),
    monsterType: z.string().min(1),
    monsterSubType: z.string().optional(),
    position: positionSchema.optional(),
  }),
  z.object({
    kind: z.literal('building-kill'),
    timestampMs: z.number().int().nonnegative(),
    killerId: participantIdSchema.optional(),
    ownerTeam: teamSideSchema,
    assistingIds: z.array(participantIdSchema),
    buildingType: z.string().min(1),
    laneType: z.string().optional(),
    towerType: z.string().optional(),
    position: positionSchema.optional(),
  }),
  z.object({
    kind: z.literal('ward-placed'),
    timestampMs: z.number().int().nonnegative(),
    creatorId: participantIdSchema.optional(),
    wardType: z.string().min(1),
  }),
]);
export type NormalizedEventKind = z.infer<typeof normalizedEventSchema>;

/**
 * A normalized event tagged with a stable id for candidate anchoring. Ids are
 * positional (`evt-N`, assigned after sorting) — deterministic for identical
 * input and mapping rules, but renumbered if the retained event set changes;
 * treat them as per-normalization ephemeral, not durable identifiers.
 */
export const timelineEventSchema = z.object({
  id: z.string().min(1),
  event: normalizedEventSchema,
});
export type TimelineEvent = z.infer<typeof timelineEventSchema>;

export const normalizedMatchSchema = z.object({
  matchId: z.string().min(1),
  queueId: z.number().int(),
  patch: z.string().min(1),
  gameDurationMs: z.number().int().positive(),
  dataTier: dataTierSchema,
  targetParticipantId: participantIdSchema,
  participants: z.array(normalizedParticipantSchema).length(10),
  /** Ascending `timestampMs` order — enforced; metrics rely on it. */
  frames: z
    .array(normalizedFrameSchema)
    .refine((f) => f.every((fr, i) => i === 0 || fr.timestampMs >= f[i - 1]!.timestampMs), {
      message: 'frames must be in ascending timestampMs order',
    }),
  events: z.array(timelineEventSchema),
});
export type NormalizedMatch = z.infer<typeof normalizedMatchSchema>;
