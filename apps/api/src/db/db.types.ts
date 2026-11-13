import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type postgres from "postgres";

import type * as schema from "./schema";

export interface DatabaseHandle {
  db: PostgresJsDatabase<typeof schema>;
  client: postgres.Sql;
}
