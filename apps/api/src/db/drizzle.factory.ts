import { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env.validation";
import { createDatabase } from "./database";
import type { DatabaseHandle } from "./db.types";

/**
 * Null when DATABASE_URL is unset: the API still boots (dev harness, e2e)
 * and consumers decide how to degrade. Domain slices that require
 * persistence are exercised with the URL configured.
 */
export function drizzleFactory(config: ConfigService<Env, true>): DatabaseHandle | null {
  const url = config.get("DATABASE_URL", { infer: true });
  const databaseHandle: DatabaseHandle | null = url ? createDatabase(url) : null;
  return databaseHandle;
}
