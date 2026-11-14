import type { AnalysisReport } from "@rifter/analysis";
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

export const dataTierEnum = pgEnum("data_tier", ["basic", "full"]);
export const reportLocaleEnum = pgEnum("report_locale", ["pl", "en"]);

/**
 * Player-facing reports — one row per (puuid, matchId), latest analysis wins.
 * Written only by the analysis worker; read endpoints are puuid-scoped.
 * `dataTier` is a column so list views surface the tier without parsing the
 * report JSONB. Versions/digest/locale/summary are denormalized from
 * `report.metadata` + `report.summary` for the same reason. Match dates are
 * not copied — list ordering joins the immutable `matches` row.
 */
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    puuid: text("puuid").notNull(),
    matchId: text("match_id").notNull(),
    report: jsonb("report").$type<AnalysisReport>().notNull(),
    contractVersion: integer("contract_version").notNull(),
    promptVersion: integer("prompt_version").notNull(),
    modelDigest: text("model_digest"),
    dataTier: dataTierEnum("data_tier").notNull(),
    locale: reportLocaleEnum("locale").notNull(),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.puuid, t.matchId], foreignColumns: [matches.puuid, matches.matchId] }),
    uniqueIndex("reports_match").on(t.puuid, t.matchId),
    index("reports_list").on(t.puuid, t.updatedAt),
  ],
);

export type ReportRow = typeof reports.$inferSelect;
export type NewReportRow = typeof reports.$inferInsert;
