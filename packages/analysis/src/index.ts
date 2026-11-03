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

export { computeMetrics, GOLD_DIFF_MINUTE, EARLY_GAME_END_MS, MID_GAME_END_MS } from './metrics.js';
export type { GamePhase, DeathTiming, ObjectiveKindSummary, ObjectiveSummary, MatchMetrics } from './metrics.js';

export {
  detectMoments,
  MOMENT_DETECTION_MIN_TIER,
  DEATH_LOOKBACK_MS,
  DEATH_LOOKAHEAD_MS,
  TEAMFIGHT_GAP_MS,
  TEAMFIGHT_MIN_KILLS,
  TEAMFIGHT_LOOKBACK_MS,
  TEAMFIGHT_LOOKAHEAD_MS,
  OBJECTIVE_FIGHT_LINK_MS,
  OBJECTIVE_KILL_LOOKBACK_MS,
  OBJECTIVE_FALLBACK_LOOKBACK_MS,
  OBJECTIVE_LOOKAHEAD_MS,
} from './moment-detection.js';
export type { MomentDetectionResult } from './moment-detection.js';

export { ollamaGenerateJson, ollamaModelDigest, AnalysisError } from './ollama-client.js';
export type { AnalysisStage, OllamaClientConfig, OllamaUsage, OllamaGenerateResult } from './ollama-client.js';

export { analyzeMatch } from './analyze.js';
export type { AnalyzeMatchDeps, AnalyzeMatchInput, AnalyzeTimings, AnalysisResult } from './analyze.js';

export { buildPrompt, PROMPT_VERSION, MAX_PROMPT_CANDIDATES } from './prompt-builder.js';
export type { BuildPromptInput, BuiltPrompt } from './prompt-builder.js';

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
