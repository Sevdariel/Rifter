import { describe, expect, it } from 'vitest';

import type { AnalysisReport, MomentCandidate } from './report-contract.js';
import {
  REPORT_CONTRACT_VERSION,
  analysisReportSchema,
  llmOutputJsonSchema,
  llmOutputSchema,
  momentCandidateSchema,
} from './report-contract.js';

const validLlmOutput = {
  summary: 'Dobre wczesne tempo, ale dwie samotne śmierci przed smokami.',
  topPriority: 0,
  moments: [
    {
      t_start: 612_000,
      t_end: 660_000,
      label: 'Solo death przed smokiem',
      mistake: 'Push bez wizji przy żywym junglerze wroga.',
      fix: 'Oddaj wave i graj pod wieżę, gdy smok za 60 s.',
    },
  ],
};

const validReport: AnalysisReport = {
  ...validLlmOutput,
  metadata: {
    matchId: 'EUW1_123456789',
    patch: '26.21',
    contractVersion: REPORT_CONTRACT_VERSION,
    promptVersion: 1,
    modelDigest: 'sha256:abc123',
    locale: 'pl',
    dataTier: 'basic',
  },
};

describe('llmOutputSchema', () => {
  it('accepts valid LLM output without metadata', () => {
    expect(llmOutputSchema.safeParse(validLlmOutput).success).toBe(true);
  });

  it('rejects a moment with t_start > t_end', () => {
    const output = structuredClone(validLlmOutput);
    output.moments[0]!.t_start = 660_000;
    output.moments[0]!.t_end = 612_000;
    expect(llmOutputSchema.safeParse(output).success).toBe(false);
  });

  it('rejects non-integer timestamps', () => {
    const output = structuredClone(validLlmOutput);
    output.moments[0]!.t_start = 612.5;
    expect(llmOutputSchema.safeParse(output).success).toBe(false);
  });

  it('rejects negative timestamps', () => {
    const output = structuredClone(validLlmOutput);
    output.moments[0]!.t_start = -1;
    expect(llmOutputSchema.safeParse(output).success).toBe(false);
  });

  it('rejects more than 10 moments', () => {
    const output = structuredClone(validLlmOutput);
    output.moments = Array(11).fill(output.moments[0]);
    expect(llmOutputSchema.safeParse(output).success).toBe(false);
  });
});

describe('analysisReportSchema', () => {
  it('accepts a valid stored report', () => {
    expect(analysisReportSchema.safeParse(validReport).success).toBe(true);
  });

  it('rejects an unsupported locale', () => {
    const report = structuredClone(validReport);
    // @ts-expect-error deliberately wrong locale
    report.metadata.locale = 'de';
    expect(analysisReportSchema.safeParse(report).success).toBe(false);
  });

  it('rejects a mismatched contract version', () => {
    const report = structuredClone(validReport);
    // @ts-expect-error deliberately wrong version
    report.metadata.contractVersion = REPORT_CONTRACT_VERSION + 1;
    expect(analysisReportSchema.safeParse(report).success).toBe(false);
  });

  it('accepts a report without topPriority', () => {
    const report = structuredClone(validReport);
    delete report.topPriority;
    expect(analysisReportSchema.safeParse(report).success).toBe(true);
  });
});

describe('llmOutputJsonSchema', () => {
  it('excludes pipeline-owned metadata from the LLM-facing schema', () => {
    const properties = (llmOutputJsonSchema as { properties?: object }).properties;
    expect(properties).not.toHaveProperty('metadata');
  });

  it('exposes the coached fields', () => {
    const properties = (llmOutputJsonSchema as { properties?: object }).properties;
    expect(properties).toHaveProperty('summary');
    expect(properties).toHaveProperty('moments');
    expect(properties).toHaveProperty('topPriority');
  });
});

describe('momentCandidateSchema', () => {
  it('accepts a valid candidate', () => {
    const candidate: MomentCandidate = {
      t_start: 600_000,
      t_end: 720_000,
      kind: 'death',
      anchorEventId: 'evt-42',
    };
    expect(momentCandidateSchema.safeParse(candidate).success).toBe(true);
  });

  it('rejects an unknown kind', () => {
    expect(
      momentCandidateSchema.safeParse({
        t_start: 0,
        t_end: 60_000,
        kind: 'economy-dip',
        anchorEventId: 'evt-1',
      }).success,
    ).toBe(false);
  });

  it('rejects an inverted window', () => {
    expect(
      momentCandidateSchema.safeParse({
        t_start: 120_000,
        t_end: 60_000,
        kind: 'death',
        anchorEventId: 'evt-1',
      }).success,
    ).toBe(false);
  });
});
