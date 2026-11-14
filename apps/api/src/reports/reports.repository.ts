import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";

import { DRIZZLE } from "../db/database";
import type { DatabaseHandle } from "../db/db.types";
import { requireDb } from "../db/require-db";
import { matches } from "../matches/schema";
import type { ReportDetail, ReportSummary } from "./reports.types";
import type { NewReportRow, ReportRow } from "./schema";
import { reports } from "./schema";

/** Persistence for player-facing reports; the only writer is the worker. */
@Injectable()
export class ReportsRepository {
  public constructor(@Inject(DRIZZLE) private readonly databaseHandle: DatabaseHandle | null) {}

  /**
   * One report per match — a newer analysis (contract/prompt bump or retry)
   * overwrites the row. The conflict target keeps the upsert atomic.
   */
  public async upsert(row: NewReportRow): Promise<ReportRow> {
    const db = requireDb(this.databaseHandle);
    const [stored] = await db
      .insert(reports)
      .values(row)
      .onConflictDoUpdate({
        target: [reports.puuid, reports.matchId],
        set: {
          report: row.report,
          contractVersion: row.contractVersion,
          promptVersion: row.promptVersion,
          modelDigest: row.modelDigest,
          dataTier: row.dataTier,
          locale: row.locale,
          summary: row.summary,
          updatedAt: new Date(),
        },
      })
      .returning();
    // The conflict target is the table's unique index — an insert always
    // returns exactly one row.
    return stored!;
  }

  /** Latest-analyzed first; game date rides along from the immutable match. */
  public async listSummaries(puuid: string): Promise<ReportSummary[]> {
    const db = requireDb(this.databaseHandle);
    const rows = await db
      .select({
        matchId: reports.matchId,
        dataTier: reports.dataTier,
        locale: reports.locale,
        contractVersion: reports.contractVersion,
        promptVersion: reports.promptVersion,
        modelDigest: reports.modelDigest,
        summary: reports.summary,
        gameCreationMs: matches.gameCreationMs,
        updatedAt: reports.updatedAt,
      })
      .from(reports)
      .innerJoin(matches, and(eq(reports.puuid, matches.puuid), eq(reports.matchId, matches.matchId)))
      .where(eq(reports.puuid, puuid))
      .orderBy(sql`${matches.gameCreationMs} DESC NULLS LAST`, desc(reports.updatedAt));
    return rows;
  }

  public async getForPuuid(puuid: string, matchId: string): Promise<ReportDetail | undefined> {
    const db = requireDb(this.databaseHandle);
    const rows = await db
      .select({
        matchId: reports.matchId,
        dataTier: reports.dataTier,
        locale: reports.locale,
        contractVersion: reports.contractVersion,
        promptVersion: reports.promptVersion,
        modelDigest: reports.modelDigest,
        summary: reports.summary,
        gameCreationMs: matches.gameCreationMs,
        updatedAt: reports.updatedAt,
        report: reports.report,
      })
      .from(reports)
      .innerJoin(matches, and(eq(reports.puuid, matches.puuid), eq(reports.matchId, matches.matchId)))
      .where(and(eq(reports.puuid, puuid), eq(reports.matchId, matchId)))
      .limit(1);
    const [row] = rows;
    return row;
  }
}
