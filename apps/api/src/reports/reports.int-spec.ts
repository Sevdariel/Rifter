import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { MatchV5Match, MatchV5Timeline } from "@rifter/analysis";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase } from "../db/database";
import type { DatabaseHandle } from "../db/db.types";
import { matches } from "../matches/schema";
import { ReportsRepository } from "./reports.repository";
import type { NewReportRow } from "./schema";

// Relative to apps/api: `pnpm --filter @rifter/api test:int` sets the cwd.
const MIGRATIONS_FOLDER = "./drizzle";
const PUUID = "puuid-target";
const MATCH_ID = "EUN1_TEST0001";
const MATCH_ID_2 = "EUN1_TEST0002";

const reportStub = { summary: "v1", metadata: {} } as unknown as NewReportRow["report"];

function row(overrides: Partial<NewReportRow> = {}): NewReportRow {
  return {
    puuid: PUUID,
    matchId: MATCH_ID,
    report: reportStub,
    contractVersion: 1,
    promptVersion: 2,
    modelDigest: "sha256:aa",
    dataTier: "basic",
    locale: "en",
    summary: "v1",
    ...overrides,
  };
}

describe("reports integration (testcontainers)", () => {
  let container: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let databaseHandle: DatabaseHandle;
  let repository: ReportsRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-alpine").start();
    databaseHandle = createDatabase(container.getConnectionUri());
    await migrate(databaseHandle.db, { migrationsFolder: MIGRATIONS_FOLDER });
    repository = new ReportsRepository(databaseHandle);
    await databaseHandle.db.insert(matches).values([
      {
        puuid: PUUID,
        matchId: MATCH_ID,
        queueId: 420,
        gameCreationMs: 1736000000000,
        match: {} as MatchV5Match,
        timeline: {} as MatchV5Timeline,
      },
      {
        puuid: PUUID,
        matchId: MATCH_ID_2,
        queueId: 400,
        gameCreationMs: 1736100000000,
        match: {} as MatchV5Match,
        timeline: {} as MatchV5Timeline,
      },
      // Another player's match — proves puuid scoping.
      {
        puuid: "other-puuid",
        matchId: "EUN1_OTHER",
        queueId: 420,
        match: {} as MatchV5Match,
        timeline: {} as MatchV5Timeline,
      },
    ]);
  });

  afterAll(async () => {
    await databaseHandle?.client.end();
    await container?.stop();
  });

  it("upsert writes once and overwrites on re-analysis", async () => {
    const first = await repository.upsert(row());
    expect(first.matchId).toBe(MATCH_ID);

    const newer = row({ promptVersion: 3, summary: "v2" });
    const second = await repository.upsert(newer);
    expect(second.id).toBe(first.id);
    expect(second.promptVersion).toBe(3);
    expect(second.summary).toBe("v2");

    const detail = await repository.getForPuuid(PUUID, MATCH_ID);
    expect(detail?.promptVersion).toBe(3);
    expect(detail?.gameCreationMs).toBe(1736000000000);
    expect(detail?.report).toMatchObject({ summary: "v1" });
  });

  it("list summaries joins match dates and scopes to the owner", async () => {
    await repository.upsert(row({ matchId: MATCH_ID_2, dataTier: "full", locale: "pl" }));
    const summaries = await repository.listSummaries(PUUID);
    expect(summaries).toHaveLength(2);
    // Newer game first (gameCreationMs desc).
    expect(summaries[0]!.matchId).toBe(MATCH_ID_2);
    expect(summaries[0]!.dataTier).toBe("full");
    expect(summaries[1]!.matchId).toBe(MATCH_ID);

    // Foreign puuid sees nothing; foreign matchId gets no detail.
    expect(await repository.listSummaries("other-puuid")).toHaveLength(0);
    expect(await repository.getForPuuid("other-puuid", MATCH_ID)).toBeUndefined();
    expect(await repository.getForPuuid(PUUID, "EUN1_NOPE")).toBeUndefined();
  });

  it("rejects a report whose match is not cached (FK)", async () => {
    await expect(repository.upsert(row({ matchId: "EUN1_GHOST" }))).rejects.toThrow();
  });
});
