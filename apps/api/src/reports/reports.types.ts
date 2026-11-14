import type { AnalysisReport } from "@rifter/analysis";

import type { ReportRow } from "./schema";

/** What the worker supplies — everything else is derived from the report. */
export interface RecordReportInput {
  puuid: string;
  matchId: string;
  report: AnalysisReport;
}

/** List view — the tier and provenance without the report payload. */
export interface ReportSummary {
  matchId: string;
  dataTier: ReportRow["dataTier"];
  locale: ReportRow["locale"];
  contractVersion: number;
  promptVersion: number;
  modelDigest: string | null;
  summary: string | null;
  gameCreationMs: number | null;
  updatedAt: Date;
}

/** Detail view — summary fields plus the full validated report. */
export interface ReportDetail extends ReportSummary {
  report: AnalysisReport;
}
