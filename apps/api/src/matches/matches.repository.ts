import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";

import { DRIZZLE } from "../db/database";
import type { DatabaseHandle } from "../db/db.types";
import { ApiException } from "../shared/errors";
import type { MatchSummary } from "./matches.types";
import { matches, type MatchRow, type NewMatchRow } from "./schema";

/** Persistence for the raw match cache. Callers get a null-handle failure. */
@Injectable()
export class MatchesRepository {
  public constructor(@Inject(DRIZZLE) private readonly databaseHandle: DatabaseHandle | null) {}

  public async exists(puuid: string, matchId: string): Promise<boolean> {
    const db = this.requireDb();
    const rows = await db
      .select({ matchId: matches.matchId })
      .from(matches)
      .where(and(eq(matches.puuid, puuid), eq(matches.matchId, matchId)))
      .limit(1);
    return rows.length > 0;
  }

  public async insert(row: NewMatchRow): Promise<void> {
    const db = this.requireDb();
    await db.insert(matches).values(row).onConflictDoNothing();
  }

  public async listSummaries(puuid: string): Promise<MatchSummary[]> {
    const db = this.requireDb();
    const rows = await db
      .select({
        matchId: matches.matchId,
        queueId: matches.queueId,
        gameCreationMs: matches.gameCreationMs,
        gameDurationSec: matches.gameDurationSec,
        fetchedAt: matches.fetchedAt,
      })
      .from(matches)
      .where(eq(matches.puuid, puuid))
      .orderBy(sql`${matches.gameCreationMs} desc nulls last`, desc(matches.fetchedAt));
    return rows;
  }

  public async get(puuid: string, matchId: string): Promise<MatchRow | undefined> {
    const db = this.requireDb();
    const rows = await db
      .select()
      .from(matches)
      .where(and(eq(matches.puuid, puuid), eq(matches.matchId, matchId)))
      .limit(1);
    return rows[0];
  }

  private requireDb(): DatabaseHandle["db"] {
    if (!this.databaseHandle) {
      throw new ApiException("DB_NOT_CONFIGURED", "DATABASE_URL is not configured", HttpStatus.SERVICE_UNAVAILABLE);
    }
    return this.databaseHandle.db;
  }
}
