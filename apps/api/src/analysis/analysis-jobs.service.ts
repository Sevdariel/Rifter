import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env.validation";
import { ApiException } from "../shared/errors";
import { AnalysisJobsRepository } from "./analysis-jobs.repository";
import type { CompleteJobInput, EnqueueJobInput, EnqueueJobResult } from "./analysis-jobs.types";
import type { AnalysisJobRow } from "./schema";

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
/** A running job claimed longer than this is treated as a crashed worker. */
const STALE_CLAIM_MS = 60 * 60 * 1000;

/**
 * Queue-facing service for analysis jobs. The worker (#20) drives
 * enqueue/claim/complete; callers read status. Retention rides on claim —
 * at most one sweep per hour, gated by an in-memory timestamp.
 */
@Injectable()
export class AnalysisJobsService {
  private readonly logger = new Logger(AnalysisJobsService.name);
  private lastSweepAt = 0;

  public constructor(
    private readonly analysisJobsRepository: AnalysisJobsRepository,
    private readonly configService: ConfigService<Env, true>,
  ) {}

  public async enqueue(input: EnqueueJobInput): Promise<EnqueueJobResult> {
    const result = await this.analysisJobsRepository.enqueue(input);
    return result;
  }

  /**
   * Claims the next queued job after re-queueing crashed claims and running a
   * due retention sweep. Both helpers run inside claim so idle polling keeps
   * the queue healthy without a separate scheduler.
   */
  public async claim(): Promise<AnalysisJobRow | undefined> {
    const requeued = await this.analysisJobsRepository.requeueStale(STALE_CLAIM_MS);
    if (requeued > 0) {
      this.logger.warn(`requeueStale returned ${requeued} crashed job(s) to queued`);
    }
    await this.maybeSweep();
    const claimed = await this.analysisJobsRepository.claim();
    return claimed;
  }

  public async markSucceeded(id: string, input: CompleteJobInput): Promise<AnalysisJobRow> {
    const updated = await this.analysisJobsRepository.markSucceeded(id, input);
    if (!updated) {
      throw new ApiException("JOB_NOT_RUNNING", "Job is not in a running state", HttpStatus.CONFLICT);
    }
    return updated;
  }

  public async markFailed(id: string, error: string): Promise<AnalysisJobRow> {
    const updated = await this.analysisJobsRepository.markFailed(id, error);
    if (!updated) {
      throw new ApiException("JOB_NOT_RUNNING", "Job is not in a running state", HttpStatus.CONFLICT);
    }
    return updated;
  }

  /** IDOR-safe read: a job is only visible to its owning puuid. */
  public async getForPuuid(puuid: string, id: string): Promise<AnalysisJobRow | undefined> {
    const job = await this.analysisJobsRepository.getForPuuid(puuid, id);
    return job;
  }

  public async listByPuuid(puuid: string): Promise<AnalysisJobRow[]> {
    const jobs = await this.analysisJobsRepository.listByPuuid(puuid);
    return jobs;
  }

  private async maybeSweep(): Promise<void> {
    if (Date.now() - this.lastSweepAt < SWEEP_INTERVAL_MS) return;
    // Attempt-time stamp: a persistently failing sweep retries hourly, not
    // on every poll tick.
    this.lastSweepAt = Date.now();
    try {
      const days = this.configService.get("JOB_RETENTION_DAYS", { infer: true });
      const deleted = await this.analysisJobsRepository.sweepRetention(days);
      if (deleted > 0) {
        this.logger.log(`retention sweep deleted ${deleted} terminal job(s)`);
      }
    } catch (error: unknown) {
      const label = error instanceof Error ? error.name : "unknown";
      // A failed sweep must not break claims; retry lands on the next tick.
      this.logger.warn(`retention sweep skipped after ${label}`);
    }
  }
}
