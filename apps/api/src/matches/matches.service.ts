import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { matchV5ToNormalized, type MatchV5Match, type NormalizedMatch } from "@rifter/analysis";

import { RiotClientService } from "../riot/riot-client.service";
import { ApiException } from "../shared/errors";
import { MatchesRepository } from "./matches.repository";
import {
  SR_QUEUE_IDS,
  type MatchSummary,
  type RawMatch,
  type SyncFrom,
  type SyncOneResult,
  type SyncRecentResult,
  type SyncStatus,
} from "./matches.types";
import type { NewMatchRow } from "./schema";
import { SEASON_STARTS } from "./seasons";
import { SyncStatusService } from "./sync-status.service";

const LIST_PAGE_SIZE = 100;

/** Syncs the authenticated player's own games into the immutable match cache. */
@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  public constructor(
    private readonly riotClientService: RiotClientService,
    private readonly matchesRepository: MatchesRepository,
    private readonly syncStatusService: SyncStatusService,
  ) {}

  public async syncOne(puuid: string, matchId: string): Promise<SyncOneResult> {
    if (await this.matchesRepository.exists(puuid, matchId)) {
      const result: SyncOneResult = { matchId, stored: false, skipped: "ALREADY_CACHED" };
      return result;
    }
    const match = await this.riotClientService.getMatch(matchId);
    if (!match.info.participants.some((p) => p.puuid === puuid)) {
      const result: SyncOneResult = { matchId, stored: false, skipped: "NOT_OWNED" };
      return result;
    }
    if (!SR_QUEUE_IDS.has(match.info.queueId)) {
      const result: SyncOneResult = { matchId, stored: false, skipped: "NON_SR_QUEUE" };
      return result;
    }
    await this.fetchAndStore(puuid, match);
    const result: SyncOneResult = { matchId, stored: true };
    return result;
  }

  public async syncRecent(puuid: string, count: number): Promise<SyncRecentResult> {
    const ids = await this.riotClientService.listMatchIds(puuid, { count });
    const result: SyncRecentResult = {
      requested: count,
      stored: 0,
      skippedCached: 0,
      skippedNonSr: 0,
      matchIds: [],
    };
    for (const matchId of ids) {
      const skip = await this.syncIfUseful(puuid, matchId);
      if (skip === "ALREADY_CACHED") result.skippedCached++;
      else if (skip === "NON_SR_QUEUE") result.skippedNonSr++;
      else {
        result.stored++;
        result.matchIds.push(matchId);
      }
    }
    return result;
  }

  public syncAll(puuid: string, from?: SyncFrom): SyncStatus {
    const current = this.syncStatusService.snapshot();
    if (current.running) {
      throw new ApiException("SYNC_IN_PROGRESS", "A full sync is already running", HttpStatus.CONFLICT);
    }
    const startTime = this.resolveFrom(from);
    this.syncStatusService.begin();
    void this.runSyncAll(puuid, startTime).catch((error: unknown) => {
      const label = error instanceof ApiException ? error.code : error instanceof Error ? error.name : "unknown";
      this.logger.error(`sync-all aborted on ${label}`);
      this.syncStatusService.finish(label);
    });
    const status = this.syncStatusService.snapshot();
    return status;
  }

  public syncStatus(): SyncStatus {
    const status = this.syncStatusService.snapshot();
    return status;
  }

  public async list(puuid: string): Promise<MatchSummary[]> {
    const summaries = await this.matchesRepository.listSummaries(puuid);
    return summaries;
  }

  public async getNormalized(puuid: string, matchId: string): Promise<NormalizedMatch> {
    const row = await this.matchesRepository.get(puuid, matchId);
    if (!row) {
      throw new ApiException("MATCH_NOT_CACHED", "Match is not cached", HttpStatus.NOT_FOUND);
    }
    const normalized = matchV5ToNormalized({ match: row.match, timeline: row.timeline }, puuid);
    return normalized;
  }

  private async runSyncAll(puuid: string, startTime?: number): Promise<void> {
    for (let start = 0; ; start += LIST_PAGE_SIZE) {
      const ids = await this.riotClientService.listMatchIds(puuid, {
        start,
        count: LIST_PAGE_SIZE,
        startTime,
      });
      this.syncStatusService.count("listed", ids.length);
      for (const matchId of ids) {
        // Per-match failures (expired ids, upstream 5xx, malformed payloads)
        // are counted and skipped: one poison match must not wedge the run.
        try {
          const outcome = await this.syncIfUseful(puuid, matchId);
          if (outcome !== "ALREADY_CACHED") this.syncStatusService.count("fetched");
          this.syncStatusService.count(
            outcome === "ALREADY_CACHED" ? "skippedCached" : outcome === "NON_SR_QUEUE" ? "skippedNonSr" : "stored",
          );
        } catch (error: unknown) {
          const label = error instanceof ApiException ? error.code : error instanceof Error ? error.name : "unknown";
          this.logger.warn(`sync-all skipped ${matchId} after ${label}`);
          this.syncStatusService.count("failed");
        }
      }
      if (ids.length < LIST_PAGE_SIZE) break;
    }
    this.syncStatusService.finish();
  }

  /** Returns the stored flag or the skip reason for a single id. */
  private async syncIfUseful(puuid: string, matchId: string): Promise<"ALREADY_CACHED" | "NON_SR_QUEUE" | "STORED"> {
    if (await this.matchesRepository.exists(puuid, matchId)) return "ALREADY_CACHED";
    const match = await this.riotClientService.getMatch(matchId);
    if (!SR_QUEUE_IDS.has(match.info.queueId)) return "NON_SR_QUEUE";
    await this.fetchAndStore(puuid, match);
    return "STORED";
  }

  private async fetchAndStore(puuid: string, match: MatchV5Match): Promise<void> {
    const timeline = await this.riotClientService.getTimeline(match.metadata.matchId);
    const info = (match as RawMatch).info;
    const row: NewMatchRow = {
      puuid,
      matchId: match.metadata.matchId,
      queueId: match.info.queueId,
      gameCreationMs: info.gameCreation ?? null,
      gameDurationSec: match.info.gameDuration ?? null,
      match,
      timeline,
    };
    await this.matchesRepository.insert(row);
  }

  private resolveFrom(from?: SyncFrom): number | undefined {
    if (from?.season) {
      const epoch = SEASON_STARTS[from.season];
      if (epoch === undefined) {
        throw new ApiException(
          "VALIDATION_ERROR",
          `Unknown season "${from.season}"; known: ${Object.keys(SEASON_STARTS).join(", ")}`,
          HttpStatus.BAD_REQUEST,
        );
      }
      return epoch;
    }
    if (from?.date) {
      return Math.floor(new Date(from.date).getTime() / 1000);
    }
    return undefined;
  }
}
