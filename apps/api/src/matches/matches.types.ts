import type { MatchV5Match } from "@rifter/analysis";
import { z } from "zod";

/** Summoner's Rift queue IDs only — no ARAM, Arena, co-op vs AI, or modes. */
export const SR_QUEUE_IDS: ReadonlySet<number> = new Set([400, 420, 430, 440, 490, 700]);

export const MAX_RECENT_COUNT = 20;

export const syncOneBodySchema = z.object({
  matchId: z.string().min(1).max(64),
});
export type SyncOneBody = z.infer<typeof syncOneBodySchema>;

export const syncRecentBodySchema = z.object({
  count: z.number().int().min(1).max(MAX_RECENT_COUNT),
});
export type SyncRecentBody = z.infer<typeof syncRecentBodySchema>;

const syncFromSchema = z
  .object({
    /** ISO date (YYYY-MM-DD); converted to a startTime epoch. */
    date: z.iso.date().optional(),
    /** Season year key, e.g. "2025". Mapped via the SEASON_STARTS table. */
    season: z
      .string()
      .regex(/^\d{4}$/)
      .optional(),
  })
  .refine((v) => !(v.date && v.season), { message: "use either date or season, not both" });

export const syncAllBodySchema = z
  .object({ from: syncFromSchema.optional() })
  .nullish()
  .transform((v) => v ?? {});
export type SyncAllBody = z.infer<typeof syncAllBodySchema>;
export type SyncFrom = z.infer<typeof syncFromSchema>;

export type SkipReason = "ALREADY_CACHED" | "NON_SR_QUEUE" | "NOT_OWNED";

export interface SyncOneResult {
  matchId: string;
  stored: boolean;
  skipped?: SkipReason;
}

export interface SyncRecentResult {
  requested: number;
  stored: number;
  skippedCached: number;
  skippedNonSr: number;
  matchIds: string[];
}

/** gameCreation (epoch ms) is absent from the shared contract but present in the raw payload. */
export type RawMatch = MatchV5Match & { info: MatchV5Match["info"] & { gameCreation?: number } };

/** In-memory progress of the background all-sync loop. */
export interface SyncStatus {
  running: boolean;
  done: boolean;
  listed: number;
  fetched: number;
  stored: number;
  skippedCached: number;
  skippedNonSr: number;
  /** Per-match failures that were skipped so the run can continue. */
  failed: number;
  lastError?: string;
}

export interface MatchSummary {
  matchId: string;
  queueId: number;
  gameCreationMs: number | null;
  gameDurationSec: number | null;
  fetchedAt: Date;
}
