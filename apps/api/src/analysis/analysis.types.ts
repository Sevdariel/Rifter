import type { AnalyzeTimings, OllamaUsage } from "@rifter/analysis";
import { z } from "zod";

import type { JobStatus } from "./analysis-jobs.types";

export const enqueueAnalysisBodySchema = z.object({
  matchId: z.string().min(1).max(64),
});

export type EnqueueAnalysisBody = z.infer<typeof enqueueAnalysisBodySchema>;

export interface EnqueueAnalysisResult {
  job: AnalysisJobView;
  /** false when the dedupe key already existed — the existing job is returned. */
  created: boolean;
}

/**
 * Wire view of a job — everything a status poller needs without the captured
 * internals (`prompt`, `report`). Report reads belong to the reports module
 * (#21); the prompt stays in the table for observability.
 */
export interface AnalysisJobView {
  id: string;
  matchId: string;
  status: JobStatus;
  contractVersion: number;
  promptVersion: number;
  modelDigest: string | null;
  error: string | null;
  tokenUsage: OllamaUsage | null;
  timings: AnalyzeTimings | null;
  retries: number | null;
  attempts: number;
  createdAt: Date;
  claimedAt: Date | null;
  finishedAt: Date | null;
}
