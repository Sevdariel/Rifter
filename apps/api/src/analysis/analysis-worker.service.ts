import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  analyzeMatch,
  ollamaGenerateJson,
  PROMPT_VERSION,
  REPORT_CONTRACT_VERSION,
  type ReportLocale,
} from "@rifter/analysis";

import type { Env } from "../config/env.validation";
import { MatchesService } from "../matches/matches.service";
import { OllamaService } from "../ollama/ollama.service";
import { AnalysisJobsService } from "./analysis-jobs.service";
import type { AnalysisJobRow } from "./schema";
import { loadPromptTemplate } from "./prompt-template";

const MAX_ERROR_LEN = 1000;

/**
 * In-process queue worker: one job at a time, claimed atomically via
 * SKIP LOCKED. Runs the `packages/analysis` pipeline against local Ollama —
 * post-game only, manual enqueue. The poll timer is `unref`d so it never
 * keeps the process alive (tests, CLI runs).
 */
@Injectable()
export class AnalysisWorkerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AnalysisWorkerService.name);
  private timer?: NodeJS.Timeout;
  private busy = false;
  private stopped = false;
  private lastTickError?: string;

  public constructor(
    private readonly analysisJobsService: AnalysisJobsService,
    private readonly matchesService: MatchesService,
    private readonly ollamaService: OllamaService,
    private readonly configService: ConfigService<Env, true>,
  ) {}

  public onModuleInit(): void {
    const enabled = this.configService.get("ANALYSIS_WORKER_ENABLED", { infer: true });
    const databaseUrl = this.configService.get("DATABASE_URL", { infer: true });
    if (!enabled || !databaseUrl) {
      this.logger.log("worker disabled — jobs stay queued until the worker runs");
      return;
    }
    // Fail fast at boot rather than per-job when the prompt template is gone.
    try {
      loadPromptTemplate();
    } catch (error: unknown) {
      const label = error instanceof Error ? error.message : String(error);
      this.logger.error(`prompt template failed to load (${label}); worker stays off`);
      return;
    }
    const pollMs = this.configService.get("ANALYSIS_WORKER_POLL_MS", { infer: true });
    this.timer = setInterval(() => void this.tick(), pollMs);
    this.timer.unref();
  }

  public onApplicationShutdown(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
    }
    // An in-flight job finishes or is requeued by the stale-claim sweep on
    // the next boot — never lost.
  }

  /** Exposed for tests; the interval calls the same path. */
  public async tick(): Promise<void> {
    if (this.busy || this.stopped) return;
    this.busy = true;
    try {
      const job = await this.analysisJobsService.claim();
      if (job) {
        this.lastTickError = undefined;
        await this.execute(job);
      }
    } catch (error: unknown) {
      const label = error instanceof Error ? error.message : String(error);
      if (label !== this.lastTickError) {
        this.lastTickError = label;
        this.logger.warn(`claim failed: ${label}`);
      }
    } finally {
      this.busy = false;
    }
  }

  private async execute(job: AnalysisJobRow): Promise<void> {
    try {
      // Versions are stamped at enqueue; a job claimed after a version bump
      // would produce a report whose provenance lies about the pipeline that
      // made it. Fail it loudly — re-enqueueing creates a correctly stamped job.
      if (job.contractVersion !== REPORT_CONTRACT_VERSION || job.promptVersion !== PROMPT_VERSION) {
        throw new Error(
          `stale job versions: job has contract=${job.contractVersion}/prompt=${job.promptVersion}, ` +
            `pipeline is ${REPORT_CONTRACT_VERSION}/${PROMPT_VERSION} — re-enqueue`,
        );
      }
      if (!(await this.ollamaService.detect())) {
        throw new Error(`Ollama unreachable at ${this.configService.get("OLLAMA_BASE_URL", { infer: true })}`);
      }
      const match = await this.matchesService.getNormalized(job.puuid, job.matchId);
      const model = await this.ollamaService.resolveModel();
      const clientConfig = this.ollamaService.clientConfig(model.name);
      const locale: ReportLocale = this.configService.get("ANALYSIS_LOCALE", { infer: true });
      const modelDigest = model.digest ?? "unknown";
      const result = await analyzeMatch(
        { match, locale },
        {
          template: loadPromptTemplate(),
          modelDigest,
          generate: (req) => ollamaGenerateJson(clientConfig, req),
        },
      );
      await this.analysisJobsService.markSucceeded(job.id, {
        report: result.report,
        prompt: result.prompt,
        modelDigest,
        tokenUsage: result.usage,
        timings: result.timings,
        retries: result.retries,
      });
      this.logger.log(`job ${job.id} (${job.matchId}) succeeded in ${result.timings.totalMs} ms`);
    } catch (error: unknown) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, MAX_ERROR_LEN);
      this.logger.warn(`job ${job.id} (${job.matchId}) failed: ${message}`);
      try {
        await this.analysisJobsService.markFailed(job.id, message);
      } catch (markError: unknown) {
        const label = markError instanceof Error ? markError.message : String(markError);
        this.logger.error(`markFailed for job ${job.id} threw: ${label}`);
      }
    }
  }
}
