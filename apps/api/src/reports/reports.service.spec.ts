import { describe, expect, it, vi } from "vitest";

import type { AnalysisReport } from "@rifter/analysis";

import { ApiException } from "../shared/errors";
import type { ReportsRepository } from "./reports.repository";
import { ReportsService } from "./reports.service";
import type { ReportDetail, ReportSummary } from "./reports.types";

const PUUID = "puuid-target";
const MATCH_ID = "EUN1_TEST0001";

const reportStub = {
  summary: "played fine",
  metadata: {
    matchId: MATCH_ID,
    patch: "15.1",
    contractVersion: 1,
    promptVersion: 2,
    modelDigest: "sha256:aa",
    locale: "en",
    dataTier: "basic",
  },
} as unknown as AnalysisReport;

describe("ReportsService", () => {
  it("record denormalizes provenance off the report metadata", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const service = new ReportsService({ upsert } as unknown as ReportsRepository);
    await service.record({ puuid: PUUID, matchId: MATCH_ID, report: reportStub });
    expect(upsert).toHaveBeenCalledWith({
      puuid: PUUID,
      matchId: MATCH_ID,
      report: reportStub,
      contractVersion: 1,
      promptVersion: 2,
      modelDigest: "sha256:aa",
      dataTier: "basic",
      locale: "en",
      summary: "played fine",
    });
  });

  it("list passes through repository summaries", async () => {
    const summary: ReportSummary = {
      matchId: MATCH_ID,
      dataTier: "basic",
      locale: "en",
      contractVersion: 1,
      promptVersion: 2,
      modelDigest: "sha256:aa",
      summary: "s",
      gameCreationMs: 1736000000000,
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    };
    const listSummaries = vi.fn().mockResolvedValue([summary]);
    const service = new ReportsService({ listSummaries } as unknown as ReportsRepository);
    const result = await service.list(PUUID);
    expect(listSummaries).toHaveBeenCalledWith(PUUID);
    expect(result).toEqual([summary]);
  });

  it("get returns the detail; missing row maps to REPORT_NOT_FOUND", async () => {
    const detail: ReportDetail = {
      matchId: MATCH_ID,
      dataTier: "basic",
      locale: "en",
      contractVersion: 1,
      promptVersion: 2,
      modelDigest: "sha256:aa",
      summary: "s",
      gameCreationMs: 1736000000000,
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      report: reportStub,
    };
    const getForPuuid = vi.fn().mockResolvedValue(detail);
    const service = new ReportsService({ getForPuuid } as unknown as ReportsRepository);
    await expect(service.get(PUUID, MATCH_ID)).resolves.toBe(detail);
    expect(getForPuuid).toHaveBeenCalledWith(PUUID, MATCH_ID);

    getForPuuid.mockResolvedValue(undefined);
    await expect(service.get("other-puuid", MATCH_ID)).rejects.toMatchObject({ code: "REPORT_NOT_FOUND" });
    expect(ApiException).toBeTruthy();
  });
});
