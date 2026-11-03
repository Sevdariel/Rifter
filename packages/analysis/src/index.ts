/**
 * Shared analysis library: report contract, deterministic metrics,
 * moment detection, LLM prompt building. Filled in by milestone M1.
 */

export {
  REPORT_CONTRACT_VERSION,
  dataTierSchema,
  reportLocaleSchema,
  momentKindSchema,
  momentCandidateSchema,
  reportMomentSchema,
  reportMetadataSchema,
  llmOutputSchema,
  analysisReportSchema,
  llmOutputJsonSchema,
} from './report-contract.js';
export type {
  DataTier,
  ReportLocale,
  MomentKind,
  MomentCandidate,
  ReportMoment,
  ReportMetadata,
  LlmOutput,
  AnalysisReport,
} from './report-contract.js';

export { validateAnalysisReport } from './report-validation.js';
export type { ReportValidationContext, ReportValidationResult } from './report-validation.js';
