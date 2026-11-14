import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { ConfigService } from "@nestjs/config";
import type { AnalysisReport, MatchV5Match, MatchV5Timeline } from "@rifter/analysis";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase } from "../db/database";
import type { DatabaseHandle } from "../db/db.types";
import type { Env } from "../config/env.validation";
import { matches } from "../matches/schema";
import { AnalysisJobsRepository } from "./analysis-jobs.repository";
import { AnalysisJobsService } from "./analysis-jobs.service";

// Relative to apps/api: `pnpm --filter @rifter/api test:int` sets the cwd.
const MIGRATIONS_FOLDER = "./drizzle";
const PUUID = "puuid-target";
const MATCH_ID = "EUN1_TEST0001";

const reportStub = { contractVersion: 1, moments: [] } as unknown as AnalysisReport;

describe("analysis jobs integration (testcontainers)", () => {
  let container: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let databaseHandle: DatabaseHandle;
  let service: AnalysisJobsService;

  const enqueueInput = { puuid: PUUID, matchId: MATCH_ID, contractVersion: 1, promptVersion: 2 };

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-alpine").start();
    databaseHandle = createDatabase(container.getConnectionUri());
    await migrate(databaseHandle.db, { migrationsFolder: MIGRATIONS_FOLDER });
    const config = { get: () => 30 } as unknown as ConfigService<Env, true>;
    service = new AnalysisJobsService(new AnalysisJobsRepository(databaseHandle), config);
    // The FK requires a cached match before any job can reference it.
    await databaseHandle.db.insert(matches).values({
      puuid: PUUID,
      matchId: MATCH_ID,
      queueId: 420,
      match: {} as MatchV5Match,
      timeline: {} as MatchV5Timeline,
    });
  });

  afterAll(async () => {
    await databaseHandle?.client.end();
    await container?.stop();
  });

  it("walks the queue state machine end to end", async () => {
    const enqueued = await service.enqueue(enqueueInput);
    expect(enqueued.created).toBe(true);
    expect(enqueued.job.status).toBe("queued");

    // Dedupe: same unique key returns the same row, never a second one.
    const again = await service.enqueue(enqueueInput);
    expect(again.created).toBe(false);
    expect(again.job.id).toBe(enqueued.job.id);

    const claimed = await service.claim();
    expect(claimed?.id).toBe(enqueued.job.id);
    expect(claimed?.status).toBe("running");
    expect(claimed?.attempts).toBe(1);

    // Queue is empty now — a second claim finds nothing.
    expect(await service.claim()).toBeUndefined();

    const done = await service.markSucceeded(enqueued.job.id, {
      report: reportStub,
      prompt: "captured prompt",
      modelDigest: "sha256:abc",
      tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      timings: { metricsMs: 1, momentsMs: 1, promptMs: 1, llmMs: 5, validationMs: 1, totalMs: 9 },
      retries: 0,
    });
    expect(done.status).toBe("succeeded");
    expect(done.finishedAt).not.toBeNull();
    expect(done.prompt).toBe("captured prompt");

    // puuid-scoped reads: owner sees the job, another player does not.
    const fetched = await service.getForPuuid(PUUID, enqueued.job.id);
    expect(fetched?.status).toBe("succeeded");
    expect(await service.getForPuuid("other-puuid", enqueued.job.id)).toBeUndefined();

    // Terminal rows refuse a second transition.
    await expect(service.markFailed(enqueued.job.id, "too late")).rejects.toMatchObject({
      code: "JOB_NOT_RUNNING",
    });
  });

  it("concurrent claims never take the same row", async () => {
    await service.enqueue({ ...enqueueInput, promptVersion: 3 });
    await service.enqueue({ ...enqueueInput, promptVersion: 4 });

    const [a, b] = await Promise.all([service.claim(), service.claim()]);
    // Both jobs get claimed exactly once — SKIP LOCKED prevents a race.
    expect(a).not.toBeUndefined();
    expect(b).not.toBeUndefined();
    expect(a?.id).not.toBe(b?.id);
  });

  it("fails the job with an error and requeues crashed claims", async () => {
    const enqueued = await service.enqueue({ ...enqueueInput, promptVersion: 5 });
    const claimed = await service.claim();
    expect(claimed?.id).toBe(enqueued.job.id);

    const failed = await service.markFailed(enqueued.job.id, "ollama unreachable");
    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("ollama unreachable");

    // Simulate a crashed worker: claim, then age the claim past the stale window.
    const crash = await service.enqueue({ ...enqueueInput, promptVersion: 6 });
    const stale = await service.claim();
    if (!stale) throw new Error("claim returned nothing");
    await databaseHandle.db.execute(
      sql`update analysis_jobs set claimed_at = now() - interval '2 hours' where id = ${stale.id}`,
    );
    // claim() re-queues the stale row, then takes it — attempts bumps to 2.
    const reclaimed = await service.claim();
    expect(reclaimed?.id).toBe(crash.job.id);
    expect(reclaimed?.attempts).toBe(2);
  });

  it("rejects jobs for matches that are not cached (FK)", async () => {
    const repository = new AnalysisJobsRepository(databaseHandle);
    await expect(
      repository.enqueue({ puuid: PUUID, matchId: "EUN1_NOPE", contractVersion: 1, promptVersion: 1 }),
    ).rejects.toThrow();
  });

  it("sweeps terminal jobs past retention, keeps queued ones", async () => {
    const repository = new AnalysisJobsRepository(databaseHandle);
    const old = await service.enqueue({ ...enqueueInput, promptVersion: 7 });
    await databaseHandle.db.execute(
      sql`update analysis_jobs set status = 'succeeded', finished_at = now() - interval '40 days' where id = ${old.job.id}`,
    );
    const swept = await repository.sweepRetention(30);
    expect(swept).toBe(1);

    const remaining = await service.listByPuuid(PUUID);
    expect(remaining.every((job) => job.id !== old.job.id)).toBe(true);
  });
});
