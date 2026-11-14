import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { Identity } from "../auth/identity.decorator";
import type { PlayerIdentity } from "../auth/identity";
import { ZodValidationPipe } from "../shared/zod-validation.pipe";
import { AnalysisService } from "./analysis.service";
import {
  enqueueAnalysisBodySchema,
  type AnalysisJobView,
  type EnqueueAnalysisBody,
  type EnqueueAnalysisResult,
} from "./analysis.types";

/** GPU minutes per request — tighter than the global floor. */
const ANALYZE_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller("analysis/jobs")
export class AnalysisController {
  public constructor(private readonly analysisService: AnalysisService) {}

  @Post()
  @HttpCode(200)
  @Throttle(ANALYZE_THROTTLE)
  public async enqueue(
    @Identity() identity: PlayerIdentity,
    @Body(new ZodValidationPipe(enqueueAnalysisBodySchema)) body: EnqueueAnalysisBody,
  ): Promise<EnqueueAnalysisResult> {
    const result = await this.analysisService.enqueue(identity.puuid, body.matchId);
    return result;
  }

  @Get()
  public async list(@Identity() identity: PlayerIdentity): Promise<AnalysisJobView[]> {
    const views = await this.analysisService.list(identity.puuid);
    return views;
  }

  @Get(":id")
  public async get(
    @Identity() identity: PlayerIdentity,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<AnalysisJobView> {
    const view = await this.analysisService.get(identity.puuid, id);
    return view;
  }
}
