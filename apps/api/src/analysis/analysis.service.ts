import { HttpStatus, Injectable } from "@nestjs/common";

import { PROMPT_VERSION, REPORT_CONTRACT_VERSION } from "@rifter/analysis";

import { MatchesService } from "../matches/matches.service";
import { ApiException } from "../shared/errors";
import { toJobView } from "./analysis-jobs.mapper";
import { AnalysisJobsService } from "./analysis-jobs.service";
import type { AnalysisJobView, EnqueueAnalysisResult } from "./analysis.types";

/**
 * Controller-facing service: validates the match is cached, enqueues
 * idempotently, and serves puuid-scoped job reads. The worker executes the
 * claimed jobs — this service never runs the pipeline.
 */
@Injectable()
export class AnalysisService {
  public constructor(
    private readonly analysisJobsService: AnalysisJobsService,
    private readonly matchesService: MatchesService,
  ) {}

  public async enqueue(puuid: string, matchId: string): Promise<EnqueueAnalysisResult> {
    // Throws MATCH_NOT_CACHED (404) — the FK would reject the insert anyway,
    // and early validation also catches rows that fail normalization.
    await this.matchesService.getNormalized(puuid, matchId);
    const { job, created } = await this.analysisJobsService.enqueue({
      puuid,
      matchId,
      contractVersion: REPORT_CONTRACT_VERSION,
      promptVersion: PROMPT_VERSION,
    });
    const result: EnqueueAnalysisResult = { job: toJobView(job), created };
    return result;
  }

  public async list(puuid: string): Promise<AnalysisJobView[]> {
    const jobs = await this.analysisJobsService.listByPuuid(puuid);
    const views = jobs.map(toJobView);
    return views;
  }

  public async get(puuid: string, id: string): Promise<AnalysisJobView> {
    const job = await this.analysisJobsService.getForPuuid(puuid, id);
    if (!job) {
      throw new ApiException("JOB_NOT_FOUND", "Job not found", HttpStatus.NOT_FOUND);
    }
    const view = toJobView(job);
    return view;
  }
}
