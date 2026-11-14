import type { AnalysisReport, AnalyzeTimings, OllamaUsage } from "@rifter/analysis";

import type { AnalysisJobRow } from "./schema";

export type JobStatus = AnalysisJobRow["status"];

/** What the caller supplies; id, status, attempts, and timestamps are server-owned. */
export interface EnqueueJobInput {
  puuid: string;
  matchId: string;
  contractVersion: number;
  promptVersion: number;
}

export interface EnqueueJobResult {
  job: AnalysisJobRow;
  /** false when the dedupe key already existed — the existing row is returned. */
  created: boolean;
}

/** Recorded on a successful run — everything the job captured for observability. */
export interface CompleteJobInput {
  report: AnalysisReport;
  prompt: string;
  modelDigest: string;
  tokenUsage: OllamaUsage;
  timings: AnalyzeTimings;
  retries: number;
}
