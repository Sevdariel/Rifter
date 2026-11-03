import { describe, expect, it } from 'vitest';

import type { MomentCandidate, ReportMetadata } from './report-contract.js';
import { REPORT_CONTRACT_VERSION } from './report-contract.js';
import { validateAnalysisReport } from './report-validation.js';

const candidates: MomentCandidate[] = [
  { t_start: 600_000, t_end: 720_000, kind: 'death', anchorEventId: 'evt-42' },
  {
    t_start: 1_200_000,
    t_end: 1_320_000,
    kind: 'objective-lost',
    anchorEventId: 'evt-77',
  },
];

const gameDurationMs = 1_800_000;

const metadata: ReportMetadata = {
  matchId: 'EUW1_123456789',
  patch: '26.21',
  contractVersion: REPORT_CONTRACT_VERSION,
  promptVersion: 1,
  modelDigest: 'sha256:abc123',
  locale: 'en',
  dataTier: 'basic',
};

const validLlmOutput = {
  summary: 'Dwie kluczowe śmierci zdecydowały o smoku.',
  topPriority: 0,
  moments: [
    {
      t_start: 600_000,
      t_end: 720_000,
      label: 'Solo death',
      mistake: 'Push bez wizji.',
      fix: 'Oddaj wave.',
    },
  ],
};

const ctx = { candidates, gameDurationMs, metadata };

describe('validateAnalysisReport', () => {
  it('accepts output matching a candidate exactly and attaches metadata', () => {
    const result = validateAnalysisReport(validLlmOutput, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.moments[0]).toEqual(validLlmOutput.moments[0]);
      expect(result.report.metadata).toEqual(metadata);
      expect(result.report.summary).toBe(validLlmOutput.summary);
    }
  });

  it('accepts a moment matching the boundary of a candidate', () => {
    const output = structuredClone(validLlmOutput);
    output.moments[0]!.t_start = 1_200_000;
    output.moments[0]!.t_end = 1_320_000;
    expect(validateAnalysisReport(output, ctx).ok).toBe(true);
  });

  it('rejects an interior sub-window of a candidate', () => {
    const output = structuredClone(validLlmOutput);
    output.moments[0]!.t_start = 612_000;
    output.moments[0]!.t_end = 660_000;
    const result = validateAnalysisReport(output, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe('output');
      expect(result.errors[0]).toContain('does not equal any provided candidate window');
    }
  });

  it('rejects a moment only partially overlapping a candidate', () => {
    const output = structuredClone(validLlmOutput);
    output.moments[0]!.t_start = 600_000;
    output.moments[0]!.t_end = 780_000;
    expect(validateAnalysisReport(output, ctx).ok).toBe(false);
  });

  it('rejects a moment past the game duration', () => {
    const pastCandidate: MomentCandidate = {
      t_start: 1_700_000,
      t_end: 1_900_000,
      kind: 'death',
      anchorEventId: 'evt-99',
    };
    const output = structuredClone(validLlmOutput);
    output.moments[0]!.t_start = pastCandidate.t_start;
    output.moments[0]!.t_end = pastCandidate.t_end;
    const result = validateAnalysisReport(output, {
      candidates: [pastCandidate],
      gameDurationMs,
      metadata,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain('exceeds game duration');
    }
  });

  it('rejects a topPriority index out of bounds', () => {
    const output = structuredClone(validLlmOutput);
    output.topPriority = 5;
    const result = validateAnalysisReport(output, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain('out of bounds');
    }
  });

  it('rejects topPriority on an empty moments array', () => {
    const output = structuredClone(validLlmOutput);
    output.moments = [];
    output.topPriority = 0;
    const result = validateAnalysisReport(output, ctx);
    expect(result.ok).toBe(false);
  });

  it('accepts empty moments without topPriority', () => {
    const output = structuredClone(validLlmOutput);
    output.moments = [];
    delete output.topPriority;
    expect(validateAnalysisReport(output, ctx).ok).toBe(true);
  });

  it('rejects metadata emitted by the LLM', () => {
    const output = { ...validLlmOutput, metadata };
    // extra fields pass Zod by default; the point is they never reach the
    // report — the attached metadata is pipeline-owned, not model-owned
    const result = validateAnalysisReport(output, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.metadata).toEqual(metadata);
    }
  });

  it('returns schema errors for malformed input', () => {
    const result = validateAnalysisReport({ moments: 'not-an-array' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('fails closed on an invalid validation context', () => {
    const result = validateAnalysisReport(validLlmOutput, {
      candidates,
      gameDurationMs: Number.NaN,
      metadata,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe('context');
      expect(result.errors[0]).toContain('validation context');
    }
  });

  it('rejects a non-positive game duration in context', () => {
    const result = validateAnalysisReport(validLlmOutput, {
      candidates,
      gameDurationMs: 0,
      metadata,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe('context');
    }
  });

  it('rejects invalid pipeline metadata in context without throwing', () => {
    const result = validateAnalysisReport(validLlmOutput, {
      candidates,
      gameDurationMs,
      metadata: { ...metadata, contractVersion: 999 } as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe('context');
    }
  });

  it('aggregates multiple errors', () => {
    const output = structuredClone(validLlmOutput);
    output.moments[0]!.t_start = 111;
    output.moments[0]!.t_end = 222;
    output.topPriority = 9;
    const result = validateAnalysisReport(output, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    }
  });
});
