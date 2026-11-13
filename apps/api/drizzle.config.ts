import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Nest; dotenv loads apps/api/.env when the scripts
// execute from this directory. dbCredentials.url is read only by `migrate` —
// `generate` diffs the schema without a connection.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
