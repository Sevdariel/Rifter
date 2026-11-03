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

export {
  teamSideSchema,
  lanePositionSchema,
  participantStatsSchema,
  normalizedParticipantSchema,
  frameParticipantSchema,
  normalizedFrameSchema,
  normalizedEventSchema,
  timelineEventSchema,
  normalizedMatchSchema,
} from './normalized-match.js';
export type {
  TeamSide,
  LanePosition,
  ParticipantStats,
  NormalizedParticipant,
  FrameParticipant,
  NormalizedFrame,
  NormalizedEventKind,
  TimelineEvent,
  NormalizedMatch,
} from './normalized-match.js';

export { matchV5ToNormalized } from './match-v5-mapper.js';
export type {
  MatchV5Match,
  MatchV5Timeline,
  MatchV5TimelineEvent,
  MatchV5TimelineFrame,
  MatchV5FrameParticipant,
  MatchV5ParticipantInfo,
  MatchV5Fixture,
} from './match-v5-mapper.js';
