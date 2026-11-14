import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { MatchV5Match, MatchV5Timeline } from "@rifter/analysis";

import type { Env } from "../config/env.validation";
import { MetricsService } from "../observability/metrics.service";
import { ApiException } from "../shared/errors";
import { RateLimiter } from "./rate-limiter";
import type { ListMatchIdsParams, RateWindow, RiotAccount, RiotEndpoint } from "./riot.types";

/** Development-key rate limits: 20 req/1s burst, 100 req/2min sustained. */
const RATE_WINDOWS: readonly RateWindow[] = [
  { limit: 20, windowMs: 1_000 },
  { limit: 100, windowMs: 120_000 },
];

const MAX_RETRIES = 3;
const DEFAULT_RETRY_AFTER_S = 1;
/** Bounds a hostile/buggy Retry-After; the sustained window is 2 min anyway. */
const MAX_RETRY_AFTER_S = 120;
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Thin client over the Riot Games API. All calls go through the sliding-window
 * limiter, honor `Retry-After` on 429, and map failures to typed ApiExceptions.
 * The key rides in the X-Riot-Token header only — never in URLs or logs.
 */
@Injectable()
export class RiotClientService {
  private readonly logger = new Logger(RiotClientService.name);
  private readonly limiter = new RateLimiter(RATE_WINDOWS);

  public constructor(
    private readonly configService: ConfigService<Env, true>,
    private readonly metricsService: MetricsService,
  ) {}

  public async getAccountByRiotId(gameName: string, tagLine: string): Promise<RiotAccount> {
    const path = `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    const account = await this.regional<RiotAccount>(path, "account-v1");
    return account;
  }

  public async listMatchIds(puuid: string, params: ListMatchIdsParams = {}): Promise<string[]> {
    const query = new URLSearchParams();
    if (params.start !== undefined) query.set("start", String(params.start));
    if (params.count !== undefined) query.set("count", String(params.count));
    if (params.startTime !== undefined) query.set("startTime", String(params.startTime));
    const suffix = query.size > 0 ? `?${query}` : "";
    const path = `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids${suffix}`;
    const ids = await this.regional<string[]>(path, "match-v5.ids");
    return ids;
  }

  public async getMatch(matchId: string): Promise<MatchV5Match> {
    const match = await this.regional<MatchV5Match>(
      `/lol/match/v5/matches/${encodeURIComponent(matchId)}`,
      "match-v5.match",
    );
    return match;
  }

  public async getTimeline(matchId: string): Promise<MatchV5Timeline> {
    const timeline = await this.regional<MatchV5Timeline>(
      `/lol/match/v5/matches/${encodeURIComponent(matchId)}/timeline`,
      "match-v5.timeline",
    );
    return timeline;
  }

  private async regional<T>(path: string, endpoint: RiotEndpoint): Promise<T> {
    const route = this.configService.get("RIOT_REGIONAL_ROUTE", { infer: true });
    const body = await this.request<T>(`https://${route}.api.riotgames.com${path}`, endpoint);
    return body;
  }

  /** Platform-shard call (euw1 etc.); reserved for future platform APIs. */
  public async platform<T>(path: string): Promise<T> {
    const route = this.configService.get("RIOT_PLATFORM_ROUTE", { infer: true });
    const body = await this.request<T>(`https://${route}.api.riotgames.com${path}`, "platform");
    return body;
  }

  private async request<T>(url: string, endpoint: RiotEndpoint): Promise<T> {
    const apiKey = this.configService.get("RIOT_API_KEY", { infer: true });
    if (!apiKey) {
      throw new ApiException("RIOT_NOT_CONFIGURED", "RIOT_API_KEY is not configured", HttpStatus.SERVICE_UNAVAILABLE);
    }
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await this.limiter.acquire();
      let res: Response;
      try {
        res = await fetch(url, {
          headers: { "X-Riot-Token": apiKey },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error: unknown) {
        this.metricsService.riotRequests.inc({ endpoint, status: "network_error" });
        throw error;
      }
      this.metricsService.riotRequests.inc({ endpoint, status: String(res.status) });
      if (res.status === 429) {
        this.metricsService.riotRateLimited.inc({ endpoint });
        void res.body?.cancel();
        if (attempt === MAX_RETRIES) break;
        const retryAfterS = Math.min(
          Number(res.headers.get("retry-after") ?? DEFAULT_RETRY_AFTER_S),
          MAX_RETRY_AFTER_S,
        );
        this.logger.warn(`Riot 429, retrying after ${retryAfterS}s (attempt ${attempt + 1})`);
        await this.sleepSeconds(retryAfterS);
        continue;
      }
      if (res.status === 404) {
        throw new ApiException("RIOT_NOT_FOUND", "Riot API resource not found", HttpStatus.NOT_FOUND);
      }
      if (res.status === 401 || res.status === 403) {
        throw new ApiException("RIOT_UNAUTHORIZED", "Riot API key missing or expired", HttpStatus.BAD_GATEWAY);
      }
      if (!res.ok) {
        throw new ApiException("RIOT_UPSTREAM", `Riot API responded ${res.status}`, HttpStatus.BAD_GATEWAY);
      }
      const body = (await res.json()) as T;
      return body;
    }
    throw new ApiException("RIOT_RATE_LIMITED", "Riot API rate limit exceeded after retries", HttpStatus.BAD_GATEWAY);
  }

  private sleepSeconds(seconds: number): Promise<void> {
    const ms = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1000;
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
