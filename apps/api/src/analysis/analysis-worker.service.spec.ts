import type { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AnalysisResult, NormalizedMatch } from "@rifter/analysis";

import type { Env } from "../config/env.validation";
import type { MatchesService } from "../matches/matches.service";
import type { MetricsService } from "../observability/metrics.service";
import type { OllamaService } from "../ollama/ollama.service";
import type { ReportsService } from "../reports/reports.service";
import type { AnalysisJobsService } from "./analysis-jobs.service";
import { AnalysisWorkerService } from "./analysis-worker.service";
import type { AnalysisJobRow } from "./schema";

vi.mock("@rifter/analysis", async (importOriginal) => {
  const original = await importOriginal<typeof import("@rifter/analysis")>();
  return {
    ...original,
    analyzeMatch: vi.fn(),
    ollamaGenerateJson: vi.fn(),
  };
});

import { analyzeMatch } from "@rifter/analysis";

const PUUID = "puuid-target";
const MATCH_ID = "EUN1_TEST0001";

function jobRow(overrides: Partial<AnalysisJobRow> = {}): AnalysisJobRow {
  return {
    id: "job-1",
    puuid: PUUID,
    matchId: MATCH_ID,
    status: "running",
    contractVersion: 1,
    promptVersion: 2,
    modelDigest: null,
    prompt: null,
    report: null,
    error: null,
    tokenUsage: null,
    timings: null,
    retries: null,
    attempts: 1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    claimedAt: new Date("2026-01-01T00:01:00Z"),
    finishedAt: null,
    ...overrides,
  };
}

const analysisResult: AnalysisResult = {
  report: { contractVersion: 1 } as AnalysisResult["report"],
  prompt: "the built prompt",
  usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  retries: 1,
  timings: { metricsMs: 1, momentsMs: 1, promptMs: 1, llmMs: 10, validationMs: 1, totalMs: 14 },
};

function makeWorker(opts: {
  jobs: Partial<AnalysisJobsService>;
  matches?: Partial<MatchesService>;
  ollama?: Partial<OllamaService>;
  reports?: Partial<ReportsService>;
  env?: Record<string, unknown>;
}) {
  const env: Record<string, unknown> = { ANALYSIS_LOCALE: "pl", ...opts.env };
  const config = { get: (key: string) => env[key] } as unknown as ConfigService<Env, true>;
  const ollama: Partial<OllamaService> = {
    detect: vi.fn().mockResolvedValue(true),
    resolveModel: vi.fn().mockResolvedValue({ name: "qwen3.5:9b", digest: "sha256:aa", pinned: true }),
    clientConfig: vi.fn().mockReturnValue({ baseUrl: "http://localhost:11434", model: "qwen3.5:9b" }),
    ...opts.ollama,
  };
  const matches: Partial<MatchesService> = {
    getNormalized: vi.fn().mockResolvedValue({ matchId: MATCH_ID } as NormalizedMatch),
    ...opts.matches,
  };
  const reports: Partial<ReportsService> = {
    record: vi.fn().mockResolvedValue(undefined),
    ...opts.reports,
  };
  const metrics = { analysisJobs: { inc: vi.fn() }, analysisJobDuration: { observe: vi.fn() } };
  const worker = new AnalysisWorkerService(
    opts.jobs as AnalysisJobsService,
    matches as MatchesService,
    ollama as OllamaService,
    reports as ReportsService,
    metrics as unknown as MetricsService,
    config,
  );
  return { worker, ollama, matches, reports, metrics };
}

describe("AnalysisWorkerService", () => {
  beforeEach(() => {
    vi.mocked(analyzeMatch).mockResolvedValue(analysisResult);
  });

  it("claims a job, runs the pipeline, and marks it succeeded with capture", async () => {
    const markSucceeded = vi.fn().mockResolvedValue(jobRow({ status: "succeeded" }));
    const claim = vi.fn().mockResolvedValueOnce(jobRow()).mockResolvedValue(undefined);
    const { worker, ollama, matches, reports, metrics } = makeWorker({ jobs: { claim, markSucceeded } });

    await worker.tick();

    expect(matches.getNormalized).toHaveBeenCalledWith(PUUID, MATCH_ID);
    expect(ollama.resolveModel).toHaveBeenCalled();
    expect(analyzeMatch).toHaveBeenCalledWith(
      { match: expect.objectContaining({ matchId: MATCH_ID }), locale: "pl" },
      expect.objectContaining({ modelDigest: "sha256:aa", template: expect.stringContaining("coaching analyst") }),
    );
    expect(markSucceeded).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        prompt: "the built prompt",
        modelDigest: "sha256:aa",
        tokenUsage: analysisResult.usage,
        retries: 1,
      }),
    );
    // The report row is written before the job is marked succeeded.
    expect(reports.record).toHaveBeenCalledWith({ puuid: PUUID, matchId: MATCH_ID, report: analysisResult.report });
    expect(vi.mocked(reports.record!).mock.invocationCallOrder[0]).toBeLessThan(
      markSucceeded.mock.invocationCallOrder[0]!,
    );
    expect(metrics.analysisJobs.inc).toHaveBeenCalledWith({ status: "succeeded" });
    expect(metrics.analysisJobDuration.observe).toHaveBeenCalledWith(analysisResult.timings.totalMs / 1000);
  });

  it("does nothing when the queue is empty", async () => {
    const claim = vi.fn().mockResolvedValue(undefined);
    const markSucceeded = vi.fn();
    const { worker } = makeWorker({ jobs: { claim, markSucceeded } });
    await worker.tick();
    expect(markSucceeded).not.toHaveBeenCalled();
  });

  it("marks the job failed when the pipeline throws", async () => {
    vi.mocked(analyzeMatch).mockRejectedValue(new Error("Ollama HTTP 500"));
    const markFailed = vi.fn().mockResolvedValue(jobRow({ status: "failed" }));
    const claim = vi.fn().mockResolvedValueOnce(jobRow());
    const { worker, metrics } = makeWorker({ jobs: { claim, markFailed } });

    await worker.tick();
    expect(markFailed).toHaveBeenCalledWith("job-1", "Ollama HTTP 500");
    expect(metrics.analysisJobs.inc).toHaveBeenCalledWith({ status: "failed" });
  });

  it("marks the job failed when the report write throws — never succeeded without a report", async () => {
    const markSucceeded = vi.fn();
    const markFailed = vi.fn().mockResolvedValue(jobRow({ status: "failed" }));
    const claim = vi.fn().mockResolvedValueOnce(jobRow());
    const record = vi.fn().mockRejectedValue(new Error("insert conflict"));
    const { worker } = makeWorker({ jobs: { claim, markSucceeded, markFailed }, reports: { record } });

    await worker.tick();
    expect(markFailed).toHaveBeenCalledWith("job-1", "insert conflict");
    expect(markSucceeded).not.toHaveBeenCalled();
  });

  it("marks the job failed when Ollama is unreachable at resolve time", async () => {
    const markFailed = vi.fn().mockResolvedValue(jobRow({ status: "failed" }));
    const claim = vi.fn().mockResolvedValueOnce(jobRow());
    const ollama = { resolveModel: vi.fn().mockRejectedValue(new Error("fetch failed")) };
    const { worker } = makeWorker({ jobs: { claim, markFailed }, ollama });
    await worker.tick();
    expect(markFailed).toHaveBeenCalledWith("job-1", "fetch failed");
  });

  it("fails a job stamped with stale pipeline versions", async () => {
    const markFailed = vi.fn().mockResolvedValue(jobRow({ status: "failed" }));
    const claim = vi.fn().mockResolvedValueOnce(jobRow({ promptVersion: 999 }));
    const { worker, ollama } = makeWorker({ jobs: { claim, markFailed } });
    await worker.tick();
    expect(markFailed).toHaveBeenCalledWith("job-1", expect.stringContaining("stale job versions"));
    expect(ollama.detect).not.toHaveBeenCalled();
  });

  it("fails the job when Ollama is unreachable", async () => {
    const markFailed = vi.fn().mockResolvedValue(jobRow({ status: "failed" }));
    const claim = vi.fn().mockResolvedValueOnce(jobRow());
    const ollama = { detect: vi.fn().mockResolvedValue(false) };
    const env = { OLLAMA_BASE_URL: "http://localhost:11434" };
    const { worker, matches } = makeWorker({ jobs: { claim, markFailed }, ollama, env });
    await worker.tick();
    expect(markFailed).toHaveBeenCalledWith("job-1", expect.stringContaining("Ollama unreachable"));
    expect(matches.getNormalized).not.toHaveBeenCalled();
  });

  it("swallows claim errors so the loop keeps polling", async () => {
    const claim = vi.fn().mockRejectedValue(new Error("DB_NOT_CONFIGURED"));
    const { worker } = makeWorker({ jobs: { claim } });
    await expect(worker.tick()).resolves.toBeUndefined();
  });
});
