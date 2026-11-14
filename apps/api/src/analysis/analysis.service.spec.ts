import { HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { PROMPT_VERSION, REPORT_CONTRACT_VERSION, type NormalizedMatch } from "@rifter/analysis";

import { ApiException } from "../shared/errors";
import type { AnalysisJobsService } from "./analysis-jobs.service";
import type { MatchesService } from "../matches/matches.service";
import { AnalysisService } from "./analysis.service";
import type { AnalysisJobRow } from "./schema";

const PUUID = "puuid-target";
const MATCH_ID = "EUN1_TEST0001";

function jobRow(overrides: Partial<AnalysisJobRow> = {}): AnalysisJobRow {
  return {
    id: "job-1",
    puuid: PUUID,
    matchId: MATCH_ID,
    status: "queued",
    contractVersion: REPORT_CONTRACT_VERSION,
    promptVersion: PROMPT_VERSION,
    modelDigest: null,
    prompt: null,
    report: null,
    error: null,
    tokenUsage: null,
    timings: null,
    retries: null,
    attempts: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    claimedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

function makeService(jobs: Partial<AnalysisJobsService>, matches: Partial<MatchesService>) {
  return new AnalysisService(jobs as AnalysisJobsService, matches as MatchesService);
}

describe("AnalysisService", () => {
  it("enqueue validates the cached match, then enqueues with the pinned versions", async () => {
    const getNormalized = vi.fn().mockResolvedValue({} as NormalizedMatch);
    const enqueue = vi.fn().mockResolvedValue({ job: jobRow(), created: true });
    const service = makeService({ enqueue }, { getNormalized });

    const result = await service.enqueue(PUUID, MATCH_ID);
    expect(getNormalized).toHaveBeenCalledWith(PUUID, MATCH_ID);
    expect(enqueue).toHaveBeenCalledWith({
      puuid: PUUID,
      matchId: MATCH_ID,
      contractVersion: REPORT_CONTRACT_VERSION,
      promptVersion: PROMPT_VERSION,
    });
    expect(result.created).toBe(true);
    expect(result.job.id).toBe("job-1");
    expect(result.job).not.toHaveProperty("puuid");
    expect(result.job).not.toHaveProperty("prompt");
    expect(result.job).not.toHaveProperty("report");
  });

  it("propagates MATCH_NOT_CACHED and never enqueues", async () => {
    const getNormalized = vi
      .fn()
      .mockRejectedValue(new ApiException("MATCH_NOT_CACHED", "Match is not cached", HttpStatus.NOT_FOUND));
    const enqueue = vi.fn();
    const service = makeService({ enqueue }, { getNormalized });
    await expect(service.enqueue(PUUID, "EUN1_NOPE")).rejects.toMatchObject({ code: "MATCH_NOT_CACHED" });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("returns the existing job on dedupe", async () => {
    const getNormalized = vi.fn().mockResolvedValue({} as NormalizedMatch);
    const enqueue = vi.fn().mockResolvedValue({ job: jobRow({ status: "running", attempts: 1 }), created: false });
    const service = makeService({ enqueue }, { getNormalized });
    const result = await service.enqueue(PUUID, MATCH_ID);
    expect(result.created).toBe(false);
    expect(result.job.status).toBe("running");
  });

  it("list and get map rows to views; get 404s on a foreign or missing id", async () => {
    const listByPuuid = vi.fn().mockResolvedValue([jobRow()]);
    const getForPuuid = vi.fn().mockResolvedValue(undefined);
    const service = makeService({ listByPuuid, getForPuuid }, {});

    const views = await service.list(PUUID);
    expect(views).toHaveLength(1);
    expect(views[0]!.matchId).toBe(MATCH_ID);
    await expect(service.get(PUUID, "job-x")).rejects.toMatchObject({ code: "JOB_NOT_FOUND" });
  });
});
