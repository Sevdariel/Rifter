/**
 * Season year -> startTime epoch seconds for the `from=season` sync filter.
 * Approximate (season open day, UTC); extend as new seasons ship.
 */
export const SEASON_STARTS: Readonly<Record<string, number>> = {
  "2024": 1704844800, // 2024-01-10
  "2025": 1736380800, // 2025-01-09
  "2026": 1767830400, // 2026-01-08
};
