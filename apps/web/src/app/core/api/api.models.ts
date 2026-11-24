import type { AnalysisReport, AnalyzeTimings, OllamaUsage } from '@rifter/analysis';

// Wire DTOs mirror apps/api response types — dates arrive as ISO strings.
// Dev-harness copies; the product UI contract layer replaces these.

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface MatchSummary {
  matchId: string;
  queueId: number;
  gameCreationMs: number | null;
  gameDurationSec: number | null;
  fetchedAt: string;
}

export interface SyncRecentResult {
  requested: number;
  stored: number;
  skippedCached: number;
  skippedNonSr: number;
  matchIds: string[];
}

export interface SyncStatus {
  running: boolean;
  done: boolean;
  listed: number;
  fetched: number;
  stored: number;
  skippedCached: number;
  skippedNonSr: number;
  failed: number;
  lastError?: string;
}

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
  createdAt: string;
  claimedAt: string | null;
  finishedAt: string | null;
}

export interface EnqueueAnalysisResult {
  job: AnalysisJobView;
  created: boolean;
}

export interface ReportSummary {
  matchId: string;
  dataTier: 'basic' | 'full';
  locale: 'pl' | 'en';
  contractVersion: number;
  promptVersion: number;
  modelDigest: string | null;
  summary: string | null;
  gameCreationMs: number | null;
  updatedAt: string;
}

export interface ReportDetail extends ReportSummary {
  report: AnalysisReport;
}

export type { AnalysisReport };
