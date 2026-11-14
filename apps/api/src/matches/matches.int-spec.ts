import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { MatchV5Match, MatchV5Timeline } from "@rifter/analysis";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createDatabase } from "../db/database";
import type { DatabaseHandle } from "../db/db.types";
import type { RiotClientService } from "../riot/riot-client.service";
import { MatchesRepository } from "./matches.repository";
import { MatchesService } from "./matches.service";
import { SyncStatusService } from "./sync-status.service";

// Relative to apps/api: `pnpm --filter @rifter/api test:int` sets the cwd.
const MIGRATIONS_FOLDER = "./drizzle";
const PUUID = "puuid-target";

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../../packages/analysis/fixtures/matches/EUN1_4021648224.json", import.meta.url)),
    "utf8",
  ),
) as { matchId: string; match: MatchV5Match; timeline: MatchV5Timeline };

describe("matches integration (testcontainers)", () => {
  let container: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let databaseHandle: DatabaseHandle;
  let repo: MatchesRepository;
  let service: MatchesService;

  const riot = {
    getMatch: vi.fn().mockImplementation(async () => structuredClone(fixture.match)),
    getTimeline: vi.fn().mockImplementation(async () => structuredClone(fixture.timeline)),
    listMatchIds: vi.fn(),
    getAccountByRiotId: vi.fn(),
    platform: vi.fn(),
  } as unknown as RiotClientService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-alpine").start();
    databaseHandle = createDatabase(container.getConnectionUri());
    await migrate(databaseHandle.db, { migrationsFolder: MIGRATIONS_FOLDER });
    repo = new MatchesRepository(databaseHandle);
    service = new MatchesService(riot, repo, new SyncStatusService());
  });

  afterAll(async () => {
    await databaseHandle?.client.end();
    await container?.stop();
  });

  it("stores and reads back an owned match end to end", async () => {
    const synced = await service.syncOne(PUUID, fixture.matchId);
    expect(synced.stored).toBe(true);

    const summaries = await service.list(PUUID);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].matchId).toBe(fixture.matchId);
    expect(summaries[0].queueId).toBe(400);

    const normalized = await service.getNormalized(PUUID, fixture.matchId);
    expect(normalized.matchId).toBe(fixture.matchId);
    expect(normalized.dataTier).toBe("basic");

    const again = await service.syncOne(PUUID, fixture.matchId);
    expect(again.skipped).toBe("ALREADY_CACHED");
  });
});
