import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase } from "./database";
import type { DatabaseHandle } from "./db.types";

// Relative to apps/api: `pnpm --filter @rifter/api test:int` sets the cwd.
const MIGRATIONS_FOLDER = "./drizzle";

// Requires a running Docker daemon: `pnpm --filter @rifter/api test:int`.
describe("db integration (testcontainers)", () => {
  let container: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let handle: DatabaseHandle;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-alpine").start();
    handle = createDatabase(container.getConnectionUri());
  });

  afterAll(async () => {
    await handle?.client.end();
    await container?.stop();
  });

  it("runs migrations cleanly against a fresh postgres", async () => {
    await expect(
      migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER }),
    ).resolves.not.toThrow();
  });

  it("answers queries through the pooled handle", async () => {
    const rows = await handle.db.execute(sql`select 1 as one`);
    expect(rows[0].one).toBe(1);
  });
});
