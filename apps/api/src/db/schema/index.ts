// Schema aggregation point for drizzle-kit. Each domain slice owns its table
// definitions (e.g. src/matches/schema.ts) and this barrel re-exports them so
// the generator sees the whole schema.
export * from "../../matches/schema";
export * from "../../analysis/schema";
export * from "../../reports/schema";
