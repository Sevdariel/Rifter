import { HttpStatus } from "@nestjs/common";

import { ApiException } from "../shared/errors";
import type { DatabaseHandle } from "./db.types";

/**
 * Repositories degrade to a typed 503 when `DATABASE_URL` is unset — the API
 * still boots for dev harnesses, but a domain call without persistence fails
 * closed instead of dereferencing a null handle.
 */
export function requireDb(databaseHandle: DatabaseHandle | null): DatabaseHandle["db"] {
  if (!databaseHandle) {
    throw new ApiException("DB_NOT_CONFIGURED", "DATABASE_URL is not configured", HttpStatus.SERVICE_UNAVAILABLE);
  }
  return databaseHandle.db;
}
