import { z } from 'zod';

/**
 * Analysis report contract v1. Zod schemas are the single source of truth:
 * `z.infer` produces the TypeScript types, `z.toJSONSchema` produces the
 * schema handed to the LLM (Ollama `format` parameter).
 */

/** Version of the analysis report contract. Bump on breaking shape changes. */
export const REPORT_CONTRACT_VERSION = 1;

/** Data tier of a match: Match-V5 only (`basic`) or parsed .rofl (`full`). */
export const dataTierSchema = z.enum(['basic', 'full']);
export type DataTier = z.infer<typeof dataTierSchema>;

/** Locales the report prose (summary, mistake, fix, label) may be generated in. */
export const reportLocaleSchema = z.enum(['pl', 'en']);
export type ReportLocale = z.infer<typeof reportLocaleSchema>;

/** Deterministic candidate-window kinds produced by moment detection. */
export const momentKindSchema = z.enum(['death', 'teamfight', 'objective-lost']);
export type MomentKind = z.infer<typeof momentKindSchema>;

/**
 * A candidate window produced by deterministic moment detection, anchored to a
 * timeline event. The LLM selects and explains candidates; a report moment is
 * valid only when it matches a provided candidate exactly (snap semantics —
 * on `basic` tier interior sub-windows would fabricate precision the data
 * does not have). Timestamps are milliseconds from game start (Match-V5
 * convention).
 */
export const momentCandidateSchema = z
  .object({
    t_start: z.number().int().nonnegative(),
    t_end: z.number().int().nonnegative(),
    kind: momentKindSchema,
    anchorEventId: z.string().min(1),
  })
  .refine((c) => c.t_start <= c.t_end, {
    message: 't_start must be <= t_end',
  });
export type MomentCandidate = z.infer<typeof momentCandidateSchema>;

/** A single coached moment in the report. */
export const reportMomentSchema = z
  .object({
    t_start: z.number().int().nonnegative().describe('Milliseconds from game start; must be <= t_end'),
    t_end: z.number().int().nonnegative().describe('Milliseconds from game start; must be >= t_start'),
    label: z.string().min(1),
    mistake: z.string().min(1),
    fix: z.string().min(1),
  })
  .refine((m) => m.t_start <= m.t_end, {
    message: 't_start must be <= t_end',
  });
export type ReportMoment = z.infer<typeof reportMomentSchema>;

/**
 * Provenance of the report. Owned by the pipeline, not the LLM: the model
 * cannot know its own digest or the prompt version, so metadata is attached
 * in code after validation and excluded from the LLM-facing schema.
 */
export const reportMetadataSchema = z.object({
  matchId: z.string().min(1),
  patch: z.string().min(1),
  contractVersion: z.literal(REPORT_CONTRACT_VERSION),
  promptVersion: z.number().int().positive(),
  modelDigest: z.string().min(1),
  locale: reportLocaleSchema,
  dataTier: dataTierSchema,
});
export type ReportMetadata = z.infer<typeof reportMetadataSchema>;

/** What the LLM actually emits — no provenance, only the coached content. */
export const llmOutputSchema = z.object({
  summary: z.string().min(1),
  topPriority: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('0-based index into the moments array of this output'),
  moments: z.array(reportMomentSchema).max(10),
});
export type LlmOutput = z.infer<typeof llmOutputSchema>;

/** The validated analysis report returned to the player and stored. */
export const analysisReportSchema = llmOutputSchema.extend({
  metadata: reportMetadataSchema,
});
export type AnalysisReport = z.infer<typeof analysisReportSchema>;

/** JSON Schema of the LLM output, for the Ollama `format` parameter. */
export const llmOutputJsonSchema = z.toJSONSchema(llmOutputSchema);
