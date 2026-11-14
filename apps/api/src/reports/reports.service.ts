import { HttpStatus, Injectable, InternalServerErrorException } from "@nestjs/common";

import { ApiException } from "../shared/errors";
import { ReportsRepository } from "./reports.repository";
import type { RecordReportInput, ReportDetail, ReportSummary } from "./reports.types";

/**
 * Report read surface (puuid-scoped) plus the worker-facing `record` — the
 * sole write path, called after a successful pipeline run and before the job
 * is marked succeeded.
 */
@Injectable()
export class ReportsService {
  public constructor(private readonly reportsRepository: ReportsRepository) {}

  /** Denormalizes provenance off the validated report and upserts the row. */
  public async record(input: RecordReportInput): Promise<void> {
    const { metadata } = input.report;
    if (metadata.matchId !== input.matchId) {
      throw new InternalServerErrorException(
        `report metadata matchId ${metadata.matchId} disagrees with job matchId ${input.matchId}`,
      );
    }
    await this.reportsRepository.upsert({
      puuid: input.puuid,
      matchId: input.matchId,
      report: input.report,
      contractVersion: metadata.contractVersion,
      promptVersion: metadata.promptVersion,
      modelDigest: metadata.modelDigest,
      dataTier: metadata.dataTier,
      locale: metadata.locale,
      summary: input.report.summary,
    });
  }

  public async list(puuid: string): Promise<ReportSummary[]> {
    const summaries = await this.reportsRepository.listSummaries(puuid);
    return summaries;
  }

  public async get(puuid: string, matchId: string): Promise<ReportDetail> {
    const detail = await this.reportsRepository.getForPuuid(puuid, matchId);
    if (!detail) {
      throw new ApiException("REPORT_NOT_FOUND", "Report not found", HttpStatus.NOT_FOUND);
    }
    return detail;
  }
}
