import {
  llmOutputSchema,
  momentCandidateSchema,
  reportMetadataSchema,
  type AnalysisReport,
  type MomentCandidate,
  type ReportMetadata,
} from './report-contract.js';
import { z } from 'zod';

/**
 * Inputs the pipeline controls — the ground truth for anchoring validation and
 * provenance. `candidates` is exactly what the prompt handed to the LLM;
 * `metadata` is attached in code (the model never emits provenance).
 */
export interface ReportValidationContext {
  candidates: MomentCandidate[];
  gameDurationMs: number;
  metadata: ReportMetadata;
}

export type ReportValidationResult =
  { ok: true; report: AnalysisReport } | { ok: false; stage: 'context' | 'output'; errors: string[] };

const validationContextSchema = z.object({
  candidates: z.array(momentCandidateSchema),
  gameDurationMs: z.number().finite().positive(),
  metadata: reportMetadataSchema,
});

/**
 * Validates raw LLM output against the LLM output schema and the anchoring
 * rules, then attaches pipeline-owned metadata.
 *
 * Snap semantics: a moment is valid only when its [t_start, t_end] equals a
 * provided candidate window exactly — the LLM selects candidates, it does not
 * invent timestamps. `t_end` must also lie inside the game duration.
 */
export function validateAnalysisReport(input: unknown, ctx: ReportValidationContext): ReportValidationResult {
  const ctxParsed = validationContextSchema.safeParse({
    candidates: ctx.candidates,
    gameDurationMs: ctx.gameDurationMs,
    metadata: ctx.metadata,
  });
  if (!ctxParsed.success) {
    return {
      ok: false,
      stage: 'context',
      errors: ctxParsed.error.issues.map((issue) => `validation context ${issue.path.join('.')}: ${issue.message}`),
    };
  }

  const parsed = llmOutputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      stage: 'output',
      errors: parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    };
  }

  const llmOutput = parsed.data;
  const errors: string[] = [];

  llmOutput.moments.forEach((moment, index) => {
    if (moment.t_end > ctx.gameDurationMs) {
      errors.push(`moments[${index}]: t_end ${moment.t_end} exceeds game duration ${ctx.gameDurationMs}`);
    }
    const anchored = ctx.candidates.some((c) => c.t_start === moment.t_start && c.t_end === moment.t_end);
    if (!anchored) {
      errors.push(
        `moments[${index}]: [${moment.t_start}, ${moment.t_end}] does not equal any provided candidate window`,
      );
    }
  });

  if (llmOutput.topPriority !== undefined && llmOutput.topPriority >= llmOutput.moments.length) {
    errors.push(`topPriority: index ${llmOutput.topPriority} out of bounds for ${llmOutput.moments.length} moments`);
  }

  if (errors.length > 0) {
    return { ok: false, stage: 'output', errors };
  }

  const report: AnalysisReport = { ...llmOutput, metadata: ctx.metadata };
  return { ok: true, report };
}
