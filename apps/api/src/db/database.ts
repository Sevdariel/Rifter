import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import type { DatabaseHandle } from "./db.types";
import * as schema from "./schema";

export const DRIZZLE = Symbol("DRIZZLE");

/**
 * Creates a pooled Drizzle handle. postgres.js connects lazily, so this never
 * blocks boot; the first query establishes connections. Callers get `null`
 * from the DRIZZLE provider when DATABASE_URL is unset.
 */
export function createDatabase(url: string): DatabaseHandle {
  const client = postgres(url, { max: 10 });
  const db = drizzle(client, { schema });
  const handle: DatabaseHandle = { db, client };
  return handle;
}
