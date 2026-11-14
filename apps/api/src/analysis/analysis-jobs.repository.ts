import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";

import { DRIZZLE } from "../db/database";
import type { DatabaseHandle } from "../db/db.types";
import { ApiException } from "../shared/errors";
import { toJobRow } from "./analysis-jobs.mapper";
import type { CompleteJobInput } from "./analysis-jobs.types";
import type { AnalysisJobRow, NewAnalysisJobRow } from "./schema";
import { analysisJobs } from "./schema";

/** Queue primitives for analysis_jobs. Worker-facing surface for #20. */
@Injectable()
export class AnalysisJobsRepository {
  public constructor(@Inject(DRIZZLE) private readonly databaseHandle: DatabaseHandle | null) {}

  /**
   * Idempotent insert on (puuid, matchId, contractVersion, promptVersion).
   * On conflict the existing row is loaded and returned with created=false.
   */
  public async enqueue(row: NewAnalysisJobRow): Promise<{ job: AnalysisJobRow; created: boolean }> {
    const db = this.requireDb();
    const dedupeKey = [
      analysisJobs.puuid,
      analysisJobs.matchId,
      analysisJobs.contractVersion,
      analysisJobs.promptVersion,
    ];
    const inserted = await db.insert(analysisJobs).values(row).onConflictDoNothing({ target: dedupeKey }).returning();
    if (inserted.length > 0) {
      const result = { job: inserted[0], created: true };
      return result;
    }
    const existing = await db
      .select()
      .from(analysisJobs)
      .where(
        and(
          eq(analysisJobs.puuid, row.puuid),
          eq(analysisJobs.matchId, row.matchId),
          eq(analysisJobs.contractVersion, row.contractVersion),
          eq(analysisJobs.promptVersion, row.promptVersion),
        ),
      )
      .limit(1);
    if (!existing[0]) {
      // ON CONFLICT waited for the racing insert, so the row must exist;
      // reaching this means a caller-supplied PK collided instead.
      throw new ApiException("JOB_DEDUPE_CONFLICT", "job insert conflicted on a non-dedupe key", HttpStatus.CONFLICT);
    }
    const result = { job: existing[0], created: false };
    return result;
  }

  /**
   * Claims the oldest queued job. The SELECT ... FOR UPDATE SKIP LOCKED
   * inside a single UPDATE keeps the claim atomic — concurrent workers can
   * never take the same row. Returns undefined when the queue is empty.
   */
  public async claim(): Promise<AnalysisJobRow | undefined> {
    const db = this.requireDb();
    const rows = await db.execute(sql`
      UPDATE ${analysisJobs}
      SET status = 'running', claimed_at = now(), attempts = ${analysisJobs.attempts} + 1
      WHERE id = (
        SELECT id FROM ${analysisJobs}
        WHERE status = 'queued'
        ORDER BY created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *
    `);
    const first = rows[0] as Record<string, unknown> | undefined;
    const claimed = first ? toJobRow(first) : undefined;
    return claimed;
  }

  public async getForPuuid(puuid: string, id: string): Promise<AnalysisJobRow | undefined> {
    const db = this.requireDb();
    const rows = await db
      .select()
      .from(analysisJobs)
      .where(and(eq(analysisJobs.id, id), eq(analysisJobs.puuid, puuid)))
      .limit(1);
    return rows[0];
  }

  public async listByPuuid(puuid: string): Promise<AnalysisJobRow[]> {
    const db = this.requireDb();
    const rows = await db
      .select()
      .from(analysisJobs)
      .where(eq(analysisJobs.puuid, puuid))
      .orderBy(desc(analysisJobs.createdAt));
    return rows;
  }

  public async markSucceeded(
    id: string,
    patch: CompleteJobInput,
  ): Promise<AnalysisJobRow | undefined> {
    const db = this.requireDb();
    const rows = await db
      .update(analysisJobs)
      .set({ ...patch, status: "succeeded", finishedAt: new Date() })
      // Completing a queued/terminal row masks caller bugs — only running rows transition.
      .where(and(eq(analysisJobs.id, id), eq(analysisJobs.status, "running")))
      .returning();
    const updated = rows[0];
    return updated;
  }

  public async markFailed(id: string, error: string): Promise<AnalysisJobRow | undefined> {
    const db = this.requireDb();
    const rows = await db
      .update(analysisJobs)
      .set({ status: "failed", error, finishedAt: new Date() })
      .where(and(eq(analysisJobs.id, id), eq(analysisJobs.status, "running")))
      .returning();
    const updated = rows[0];
    return updated;
  }

  /**
   * A worker crash leaves a row in `running` forever. Anything claimed longer
   * ago than `staleMs` goes back to `queued` so it can be claimed again.
   */
  public async requeueStale(staleMs: number): Promise<number> {
    const db = this.requireDb();
    const cutoff = new Date(Date.now() - staleMs);
    const rows = await db
      .update(analysisJobs)
      .set({ status: "queued", claimedAt: null })
      .where(and(eq(analysisJobs.status, "running"), lt(analysisJobs.claimedAt, cutoff)))
      .returning({ id: analysisJobs.id });
    const count = rows.length;
    return count;
  }

  /** Deletes terminal jobs finished more than `retentionDays` ago. */
  public async sweepRetention(retentionDays: number): Promise<number> {
    const db = this.requireDb();
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const rows = await db
      .delete(analysisJobs)
      .where(
        and(
          inArray(analysisJobs.status, ["succeeded", "failed"]),
          isNotNull(analysisJobs.finishedAt),
          lt(analysisJobs.finishedAt, cutoff),
        ),
      )
      .returning({ id: analysisJobs.id });
    const count = rows.length;
    return count;
  }

  private requireDb() {
    if (!this.databaseHandle) {
      throw new ApiException("DB_NOT_CONFIGURED", "DATABASE_URL is not configured", HttpStatus.SERVICE_UNAVAILABLE);
    }
    return this.databaseHandle.db;
  }
}
