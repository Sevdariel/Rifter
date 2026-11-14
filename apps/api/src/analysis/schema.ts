import type { AnalysisReport, AnalyzeTimings, OllamaUsage } from "@rifter/analysis";
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { matches } from "../matches/schema";

export const analysisJobStatus = pgEnum("analysis_job_status", ["queued", "running", "succeeded", "failed"]);

/**
 * Analysis pipeline queue, one row per (puuid, matchId, contractVersion,
 * promptVersion). The unique index makes enqueue idempotent — re-requesting
 * the same analysis returns the existing job. `prompt`/`report`/`error`
 * capture each run for observability; `report` also feeds the reports slice
 * (#21). Rows FK to the immutable match cache so a job can only exist for a
 * game already stored locally.
 */
export const analysisJobs = pgTable(
  "analysis_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    puuid: text("puuid").notNull(),
    matchId: text("match_id").notNull(),
    status: analysisJobStatus("status").notNull().default("queued"),
    contractVersion: integer("contract_version").notNull(),
    promptVersion: integer("prompt_version").notNull(),
    modelDigest: text("model_digest"),
    prompt: text("prompt"),
    report: jsonb("report").$type<AnalysisReport>(),
    error: text("error"),
    tokenUsage: jsonb("token_usage").$type<OllamaUsage>(),
    timings: jsonb("timings").$type<AnalyzeTimings>(),
    retries: integer("retries"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({ columns: [t.puuid, t.matchId], foreignColumns: [matches.puuid, matches.matchId] }),
    uniqueIndex("analysis_jobs_dedupe").on(t.puuid, t.matchId, t.contractVersion, t.promptVersion),
    index("analysis_jobs_claim").on(t.status, t.createdAt),
    index("analysis_jobs_finished").on(t.finishedAt),
  ],
);

export type AnalysisJobRow = typeof analysisJobs.$inferSelect;
export type NewAnalysisJobRow = typeof analysisJobs.$inferInsert;
