import type { AnalysisJobView } from "./analysis.types";
import type { AnalysisJobRow } from "./schema";

/** Postgres returns snake_case for raw RETURNING rows; map to the drizzle row shape. */
export function toJobRow(row: Record<string, unknown>): AnalysisJobRow {
  const job: AnalysisJobRow = {
    id: row.id as string,
    puuid: row.puuid as string,
    matchId: row.match_id as string,
    status: row.status as AnalysisJobRow["status"],
    contractVersion: row.contract_version as number,
    promptVersion: row.prompt_version as number,
    modelDigest: (row.model_digest as string | null) ?? null,
    prompt: (row.prompt as string | null) ?? null,
    report: (row.report as AnalysisJobRow["report"]) ?? null,
    error: (row.error as string | null) ?? null,
    tokenUsage: (row.token_usage as AnalysisJobRow["tokenUsage"]) ?? null,
    timings: (row.timings as AnalysisJobRow["timings"]) ?? null,
    retries: (row.retries as number | null) ?? null,
    attempts: row.attempts as number,
    createdAt: row.created_at as Date,
    claimedAt: (row.claimed_at as Date | null) ?? null,
    finishedAt: (row.finished_at as Date | null) ?? null,
  };
  return job;
}

/** Public wire shape — drops puuid (already scoped) and the captured prompt/report. */
export function toJobView(row: AnalysisJobRow): AnalysisJobView {
  const view: AnalysisJobView = {
    id: row.id,
    matchId: row.matchId,
    status: row.status,
    contractVersion: row.contractVersion,
    promptVersion: row.promptVersion,
    modelDigest: row.modelDigest,
    error: row.error,
    tokenUsage: row.tokenUsage,
    timings: row.timings,
    retries: row.retries,
    attempts: row.attempts,
    createdAt: row.createdAt,
    claimedAt: row.claimedAt,
    finishedAt: row.finishedAt,
  };
  return view;
}
