import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { MatchV5Match, MatchV5Timeline } from "@rifter/analysis";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RiotClientService } from "../riot/riot-client.service";
import { ApiException } from "../shared/errors";
import type { MatchesRepository } from "./matches.repository";
import { MatchesService } from "./matches.service";
import { SyncStatusService } from "./sync-status.service";

const PUUID = "puuid-target";

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../../packages/analysis/fixtures/matches/EUN1_4021648224.json", import.meta.url)),
    "utf8",
  ),
) as { matchId: string; match: MatchV5Match; timeline: MatchV5Timeline };

function srMatch(matchId: string, puuid = PUUID): MatchV5Match {
  const match = structuredClone(fixture.match);
  match.metadata.matchId = matchId;
  match.info.queueId = 420;
  match.info.participants[0].puuid = puuid;
  return match;
}

function makeService() {
  const riot = {
    getMatch: vi.fn(),
    getTimeline: vi.fn().mockResolvedValue(fixture.timeline),
    listMatchIds: vi.fn(),
    getAccountByRiotId: vi.fn(),
    platform: vi.fn(),
  } as unknown as RiotClientService;
  const repo = {
    exists: vi.fn().mockResolvedValue(false),
    insert: vi.fn().mockResolvedValue(undefined),
    listSummaries: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(undefined),
  } as unknown as MatchesRepository;
  const service = new MatchesService(riot, repo, new SyncStatusService());
  return { service, riot, repo };
}

describe("MatchesService.syncOne", () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  it("short-circuits on cached matches without Riot calls", async () => {
    vi.mocked(ctx.repo.exists).mockResolvedValue(true);
    const result = await ctx.service.syncOne(PUUID, "M1");
    expect(result).toEqual({ matchId: "M1", stored: false, skipped: "ALREADY_CACHED" });
    expect(ctx.riot.getMatch).not.toHaveBeenCalled();
  });

  it("rejects matches the player was not in", async () => {
    const foreign = srMatch("M1");
    foreign.info.participants.forEach((p) => (p.puuid = "someone-else"));
    vi.mocked(ctx.riot.getMatch).mockResolvedValue(foreign);
    const result = await ctx.service.syncOne(PUUID, "M1");
    expect(result.skipped).toBe("NOT_OWNED");
    expect(ctx.repo.insert).not.toHaveBeenCalled();
  });

  it("skips non-SR queues without fetching the timeline", async () => {
    const aram = srMatch("M1");
    aram.info.queueId = 450;
    vi.mocked(ctx.riot.getMatch).mockResolvedValue(aram);
    const result = await ctx.service.syncOne(PUUID, "M1");
    expect(result.skipped).toBe("NON_SR_QUEUE");
    expect(ctx.riot.getTimeline).not.toHaveBeenCalled();
  });

  it("stores match + timeline for an owned SR game", async () => {
    vi.mocked(ctx.riot.getMatch).mockResolvedValue(srMatch("M1"));
    const result = await ctx.service.syncOne(PUUID, "M1");
    expect(result.stored).toBe(true);
    expect(ctx.repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ puuid: PUUID, matchId: "M1", queueId: 420 }),
    );
  });
});

describe("MatchesService.syncRecent", () => {
  it("counts stored/cached/non-SR outcomes", async () => {
    const { service, riot, repo } = makeService();
    vi.mocked(riot.listMatchIds).mockResolvedValue(["A", "B", "C"]);
    vi.mocked(repo.exists).mockResolvedValueOnce(true).mockResolvedValue(false);
    const aram = srMatch("C");
    aram.info.queueId = 450;
    vi.mocked(riot.getMatch).mockResolvedValueOnce(srMatch("B")).mockResolvedValueOnce(aram);
    const result = await service.syncRecent(PUUID, 3);
    expect(result).toMatchObject({ stored: 1, skippedCached: 1, skippedNonSr: 1 });
    expect(result.matchIds).toEqual(["B"]);
  });
});

describe("MatchesService.syncAll", () => {
  it("rejects a second run while one is in flight", async () => {
    const { service, riot } = makeService();
    let resolveIds: (ids: string[]) => void = () => undefined;
    vi.mocked(riot.listMatchIds).mockImplementation(() => new Promise<string[]>((resolve) => (resolveIds = resolve)));
    service.syncAll(PUUID);
    expect(() => service.syncAll(PUUID)).toThrow(ApiException);
    resolveIds([]);
    await vi.waitFor(() => expect(service.syncStatus().done).toBe(true));
  });

  it("rejects unknown season keys", () => {
    const { service } = makeService();
    expect(() => service.syncAll(PUUID, { season: "1999" })).toThrow(/Unknown season/);
  });

  it("pages ids, stores SR matches, and finishes with done", async () => {
    const { service, riot } = makeService();
    vi.mocked(riot.listMatchIds).mockResolvedValue(["A", "B"]);
    vi.mocked(riot.getMatch).mockResolvedValue(srMatch("A"));
    service.syncAll(PUUID, { date: "2025-01-01" });
    await vi.waitFor(() => expect(service.syncStatus().done).toBe(true));
    const status = service.syncStatus();
    expect(status).toMatchObject({ running: false, listed: 2, stored: 2 });
    expect(riot.listMatchIds).toHaveBeenCalledWith(PUUID, expect.objectContaining({ startTime: 1735689600 }));
  });

  it("pages with start offsets until a short page", async () => {
    const { service, riot } = makeService();
    const page1 = Array.from({ length: 100 }, (_, i) => `M${i}`);
    vi.mocked(riot.listMatchIds).mockResolvedValueOnce(page1).mockResolvedValueOnce(["LAST"]);
    vi.mocked(riot.getMatch).mockResolvedValue(srMatch("X"));
    service.syncAll(PUUID);
    await vi.waitFor(() => expect(service.syncStatus().done).toBe(true));
    expect(riot.listMatchIds).toHaveBeenNthCalledWith(2, PUUID, expect.objectContaining({ start: 100 }));
    expect(service.syncStatus().listed).toBe(101);
  });

  it("counts per-match failures and keeps going", async () => {
    const { service, riot } = makeService();
    vi.mocked(riot.listMatchIds).mockResolvedValue(["BAD", "OK"]);
    vi.mocked(riot.getMatch)
      .mockRejectedValueOnce(new ApiException("RIOT_UPSTREAM", "boom", 502))
      .mockResolvedValueOnce(srMatch("OK"));
    service.syncAll(PUUID);
    await vi.waitFor(() => expect(service.syncStatus().done).toBe(true));
    expect(service.syncStatus()).toMatchObject({ failed: 1, stored: 1 });
  });

  it("aborts with lastError when listing itself fails", async () => {
    const { service, riot } = makeService();
    vi.mocked(riot.listMatchIds).mockRejectedValue(new ApiException("RIOT_UPSTREAM", "boom", 502));
    service.syncAll(PUUID);
    await vi.waitFor(() => expect(service.syncStatus().done).toBe(true));
    expect(service.syncStatus()).toMatchObject({
      running: false,
      failed: 0,
      lastError: "RIOT_UPSTREAM",
    });
  });
});

describe("MatchesService.getNormalized", () => {
  it("throws MATCH_NOT_CACHED when absent", async () => {
    const { service } = makeService();
    await expect(service.getNormalized(PUUID, "M")).rejects.toMatchObject({
      code: "MATCH_NOT_CACHED",
    });
  });

  it("normalizes a cached row via packages/analysis", async () => {
    const { service, repo } = makeService();
    vi.mocked(repo.get).mockResolvedValue({
      puuid: PUUID,
      matchId: fixture.matchId,
      queueId: 400,
      gameCreationMs: 1793306265976,
      gameDurationSec: 1800,
      match: fixture.match,
      timeline: fixture.timeline,
      fetchedAt: new Date(),
    });
    const normalized = await service.getNormalized(PUUID, fixture.matchId);
    expect(normalized.matchId).toBe(fixture.matchId);
    expect(normalized.dataTier).toBe("basic");
    expect(normalized.participants).toHaveLength(10);
  });
});
