// Schema aggregation point for drizzle-kit. Each domain slice owns its table
// definitions (e.g. src/matches/schema.ts) and this barrel re-exports them so
// the generator sees the whole schema. Domain tables land with their owning
// stories: matches (#19), analysis_jobs (#22), reports (#21).
export {};
