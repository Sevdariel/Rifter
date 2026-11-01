/**
 * Shared analysis library: report contract, deterministic metrics,
 * moment detection, LLM prompt building. Filled in by milestone M1.
 */

/** Data tier of a match: Match-V5 only (`basic`) or parsed .rofl (`full`). */
export type DataTier = 'basic' | 'full';

/** Version of the analysis report contract. Bump on breaking shape changes. */
export const REPORT_CONTRACT_VERSION = 0;
