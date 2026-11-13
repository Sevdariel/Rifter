import type { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../config/env.validation";
import { ApiException } from "../shared/errors";
import { RiotClientService } from "./riot-client.service";

const ENV: Partial<Env> = {
  RIOT_API_KEY: "test-key",
  RIOT_REGIONAL_ROUTE: "europe",
  RIOT_PLATFORM_ROUTE: "euw1",
};

function makeService(): RiotClientService {
  const config = {
    get: (key: keyof Env) => ENV[key],
  } as unknown as ConfigService<Env, true>;
  return new RiotClientService(config);
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("RiotClientService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the key in X-Riot-Token on the regional host", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, ["EUW1_1"]));
    vi.stubGlobal("fetch", fetchMock);
    const client = makeService();
    const ids = await client.listMatchIds("puuid-a", { count: 5, startTime: 100 });
    expect(ids).toEqual(["EUW1_1"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/puuid-a/ids?count=5&startTime=100",
    );
    expect((init.headers as Record<string, string>)["X-Riot-Token"]).toBe("test-key");
  });

  it("maps 401/403 to RIOT_UNAUTHORIZED", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, {})));
    const client = makeService();
    await expect(client.getMatch("X")).rejects.toMatchObject({ code: "RIOT_UNAUTHORIZED" });
  });

  it("maps 404 to RIOT_NOT_FOUND", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(404, {})));
    const client = makeService();
    await expect(client.getMatch("X")).rejects.toMatchObject({ code: "RIOT_NOT_FOUND" });
  });

  it("retries after a 429 honoring Retry-After", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, {}, { "retry-after": "0" }))
      .mockResolvedValueOnce(jsonResponse(200, { metadata: { matchId: "M" }, info: {} }));
    vi.stubGlobal("fetch", fetchMock);
    const client = makeService();
    const match = await client.getMatch("M");
    expect(match.metadata.matchId).toBe("M");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("exhausts retries into RIOT_RATE_LIMITED", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(429, {}, { "retry-after": "0" }));
    vi.stubGlobal("fetch", fetchMock);
    const client = makeService();
    await expect(client.getMatch("M")).rejects.toMatchObject({ code: "RIOT_RATE_LIMITED" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("fails RIOT_NOT_CONFIGURED without a key", async () => {
    const config = { get: () => undefined } as unknown as ConfigService<Env, true>;
    const client = new RiotClientService(config);
    await expect(client.getMatch("M")).rejects.toBeInstanceOf(ApiException);
  });
});
