import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { NormalizedMatch } from "@rifter/analysis";

import { Identity } from "../auth/identity.decorator";
import type { PlayerIdentity } from "../auth/identity";
import { ZodValidationPipe } from "../shared/zod-validation.pipe";
import { MatchesService } from "./matches.service";
import {
  syncAllBodySchema,
  syncOneBodySchema,
  syncRecentBodySchema,
  type MatchSummary,
  type SyncAllBody,
  type SyncOneBody,
  type SyncOneResult,
  type SyncRecentBody,
  type SyncRecentResult,
  type SyncStatus,
} from "./matches.types";

const SYNC_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller("matches")
export class MatchesController {
  public constructor(private readonly matches: MatchesService) {}

  @Post("sync/one")
  @HttpCode(200)
  @Throttle(SYNC_THROTTLE)
  public async syncOne(
    @Identity() identity: PlayerIdentity,
    @Body(new ZodValidationPipe(syncOneBodySchema)) body: SyncOneBody,
  ): Promise<SyncOneResult> {
    const result = await this.matches.syncOne(identity.puuid, body.matchId);
    return result;
  }

  @Post("sync/recent")
  @HttpCode(200)
  @Throttle(SYNC_THROTTLE)
  public async syncRecent(
    @Identity() identity: PlayerIdentity,
    @Body(new ZodValidationPipe(syncRecentBodySchema)) body: SyncRecentBody,
  ): Promise<SyncRecentResult> {
    const result = await this.matches.syncRecent(identity.puuid, body.count);
    return result;
  }

  @Post("sync/all")
  @HttpCode(202)
  @Throttle(SYNC_THROTTLE)
  public syncAll(
    @Identity() identity: PlayerIdentity,
    @Body(new ZodValidationPipe(syncAllBodySchema)) body: SyncAllBody,
  ): SyncStatus {
    const status = this.matches.syncAll(identity.puuid, body.from);
    return status;
  }

  @Get("sync/status")
  public syncStatus(): SyncStatus {
    const status = this.matches.syncStatus();
    return status;
  }

  @Get()
  public list(@Identity() identity: PlayerIdentity): Promise<MatchSummary[]> {
    const summaries = this.matches.list(identity.puuid);
    return summaries;
  }

  @Get(":matchId")
  public async get(@Identity() identity: PlayerIdentity, @Param("matchId") matchId: string): Promise<NormalizedMatch> {
    const normalized = await this.matches.getNormalized(identity.puuid, matchId);
    return normalized;
  }
}
