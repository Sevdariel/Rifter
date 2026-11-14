import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { ConfigService } from "@nestjs/config";
import type { AnalysisResult, MatchV5Match, MatchV5Timeline, NormalizedMatch } from "@rifter/analysis";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createDatabase } from "../db/database";
import type { DatabaseHandle } from "../db/db.types";
import type { Env } from "../config/env.validation";
import { matches } from "../matches/schema";
import type { MatchesService } from "../matches/matches.service";
import type { OllamaService } from "../ollama/ollama.service";
import { ReportsRepository } from "../reports/reports.repository";
import { ReportsService } from "../reports/reports.service";
import { AnalysisJobsRepository } from "./analysis-jobs.repository";
import { AnalysisJobsService } from "./analysis-jobs.service";
import { AnalysisWorkerService } from "./analysis-worker.service";
import { analysisJobs } from "./schema";
import { eq } from "drizzle-orm";

vi.mock("@rifter/analysis", async (importOriginal) => {
  const original = await importOriginal<typeof import("@rifter/analysis")>();
  return {
    ...original,
    analyzeMatch: vi.fn(),
  };
});

import { analyzeMatch } from "@rifter/analysis";

// Relative to apps/api: `pnpm --filter @rifter/api test:int` sets the cwd.
const MIGRATIONS_FOLDER = "./drizzle";
const PUUID = "puuid-target";
const MATCH_ID = "EUN1_TEST0001";
const MATCH_ID_2 = "EUN1_TEST0002";

const analysisResult: AnalysisResult = {
  report: {
    summary: "ok",
    moments: [],
    metadata: {
      matchId: MATCH_ID,
      patch: "15.1",
      contractVersion: 1,
      promptVersion: 2,
      modelDigest: "sha256:aa",
      locale: "en",
      dataTier: "basic",
    },
  } as unknown as AnalysisResult["report"],
  prompt: "built prompt",
  usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  retries: 0,
  timings: { metricsMs: 1, momentsMs: 1, promptMs: 1, llmMs: 5, validationMs: 1, totalMs: 9 },
};

describe("analysis worker integration (testcontainers)", () => {
  let container: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let databaseHandle: DatabaseHandle;
  let jobsService: AnalysisJobsService;
  let reportsService: ReportsService;
  let worker: AnalysisWorkerService;

  const config = {
    get: (key: string) => (key === "ANALYSIS_LOCALE" ? "en" : undefined),
  } as unknown as ConfigService<Env, true>;

  const matchesService = {
    getNormalized: vi.fn().mockResolvedValue({ matchId: MATCH_ID } as NormalizedMatch),
  } as unknown as MatchesService;

  const ollamaService = {
    detect: vi.fn().mockResolvedValue(true),
    resolveModel: vi.fn().mockResolvedValue({ name: "qwen3.5:9b", digest: "sha256:aa", pinned: true }),
    clientConfig: vi.fn().mockReturnValue({ baseUrl: "http://localhost:11434", model: "qwen3.5:9b" }),
  } as unknown as OllamaService;

  beforeAll(async () => {
    vi.mocked(analyzeMatch).mockResolvedValue(analysisResult);
    container = await new PostgreSqlContainer("postgres:18-alpine").start();
    databaseHandle = createDatabase(container.getConnectionUri());
    await migrate(databaseHandle.db, { migrationsFolder: MIGRATIONS_FOLDER });
    jobsService = new AnalysisJobsService(new AnalysisJobsRepository(databaseHandle), config);
    reportsService = new ReportsService(new ReportsRepository(databaseHandle));
    worker = new AnalysisWorkerService(jobsService, matchesService, ollamaService, reportsService, config);
    await databaseHandle.db.insert(matches).values([
      { puuid: PUUID, matchId: MATCH_ID, queueId: 420, match: {} as MatchV5Match, timeline: {} as MatchV5Timeline },
      { puuid: PUUID, matchId: MATCH_ID_2, queueId: 420, match: {} as MatchV5Match, timeline: {} as MatchV5Timeline },
    ]);
  });

  afterAll(async () => {
    await databaseHandle?.client.end();
    await container?.stop();
  });

  it("tick claims a queued job and persists the captured result", async () => {
    const { job } = await jobsService.enqueue({
      puuid: PUUID,
      matchId: MATCH_ID,
      contractVersion: 1,
      promptVersion: 2,
    });

    await worker.tick();

    const rows = await databaseHandle.db.select().from(analysisJobs).where(eq(analysisJobs.id, job.id));
    const finished = rows[0]!;
    expect(finished.status).toBe("succeeded");
    expect(finished.prompt).toBe("built prompt");
    expect(finished.modelDigest).toBe("sha256:aa");
    expect(finished.tokenUsage).toMatchObject({ totalTokens: 15 });
    expect(finished.finishedAt).not.toBeNull();

    // The report row was written by the worker before markSucceeded.
    const stored = await reportsService.get(PUUID, MATCH_ID);
    expect(stored.matchId).toBe(MATCH_ID);
    expect(stored.report).toMatchObject({ summary: "ok" });

    // The queue is drained — a second tick is a no-op.
    await worker.tick();
  });

  it("tick marks the job failed when the pipeline throws", async () => {
    vi.mocked(analyzeMatch).mockRejectedValueOnce(new Error("Ollama request timed out"));
    const { job } = await jobsService.enqueue({
      puuid: PUUID,
      matchId: MATCH_ID_2,
      contractVersion: 1,
      promptVersion: 2,
    });

    await worker.tick();

    const fetched = await jobsService.getForPuuid(PUUID, job.id);
    expect(fetched?.status).toBe("failed");
    expect(fetched?.error).toBe("Ollama request timed out");
  });
});
