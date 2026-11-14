import type { MatchV5Match, MatchV5Timeline } from "@rifter/analysis";
import { bigint, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Immutable cache of raw Match-V5 payloads, owned per player. The composite
 * key keeps rows per owner so two tracked players in the same game never
 * share a row. Payloads are stored verbatim; normalization happens on read
 * via packages/analysis.
 */
export const matches = pgTable(
  "matches",
  {
    puuid: text("puuid").notNull(),
    matchId: text("match_id").notNull(),
    queueId: integer("queue_id").notNull(),
    gameCreationMs: bigint("game_creation_ms", { mode: "number" }),
    gameDurationSec: integer("game_duration_sec"),
    match: jsonb("match").notNull().$type<MatchV5Match>(),
    timeline: jsonb("timeline").notNull().$type<MatchV5Timeline>(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.puuid, t.matchId] })],
);

export type MatchRow = typeof matches.$inferSelect;
export type NewMatchRow = typeof matches.$inferInsert;
