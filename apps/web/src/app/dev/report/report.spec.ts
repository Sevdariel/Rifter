import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { RifterApi } from '../../core/api/rifter-api';
import type { ReportDetail } from '../../core/api/api.models';
import { Report } from './report';

const DETAIL: ReportDetail = {
  matchId: 'EUW1_1',
  dataTier: 'basic',
  locale: 'pl',
  contractVersion: 1,
  promptVersion: 3,
  modelDigest: 'sha256:abc',
  summary: 's',
  gameCreationMs: null,
  updatedAt: '2026-11-20T11:00:00.000Z',
  report: {
    summary: 'Solid early game, shaky mid.',
    topPriority: 1,
    moments: [
      {
        t_start: 120_000,
        t_end: 150_000,
        label: 'First death',
        mistake: 'No ward',
        fix: 'Ward river',
      },
      {
        t_start: 1_260_000,
        t_end: 1_300_000,
        label: 'Baron throw',
        mistake: 'Chased',
        fix: 'Reset',
      },
    ],
    metadata: {
      matchId: 'EUW1_1',
      patch: '15.22',
      contractVersion: 1,
      promptVersion: 3,
      modelDigest: 'sha256:abc',
      locale: 'pl',
      dataTier: 'basic',
    },
  },
};

async function setup(detail: ReportDetail | Error = DETAIL) {
  const api = {
    getReport:
      detail instanceof Error
        ? vi.fn(async () => Promise.reject(detail))
        : vi.fn(async () => detail),
  };
  await TestBed.configureTestingModule({
    imports: [Report],
    providers: [{ provide: RifterApi, useValue: api }, provideRouter([])],
  }).compileComponents();
  const fixture = TestBed.createComponent(Report);
  fixture.componentRef.setInput('matchId', 'EUW1_1');
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('Report', () => {
  it('renders metadata, summary and moments with formatted times', async () => {
    const fixture = await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('basic');
    expect(text).toContain('15.22');
    expect(text).toContain('v3');
    expect(text).toContain('Solid early game');
    expect(text).toContain('2:00 – 2:30');
    expect(text).toContain('21:00 – 21:40');
    expect(text).toContain('Baron throw');
  });

  it('marks the top-priority moment', async () => {
    const fixture = await setup();
    const top = fixture.nativeElement.querySelector('tr.top');
    expect(top?.textContent).toContain('Baron throw');
    expect(top?.querySelector('.top-badge')?.textContent).toContain('top');
  });

  it('exposes the raw JSON in a details block', async () => {
    const fixture = await setup();
    const pre = fixture.nativeElement.querySelector('details pre');
    expect(pre?.textContent).toContain('"Baron throw"');
  });

  it('shows the error when the report fails to load', async () => {
    const fixture = await setup(new Error('not found'));
    const banner = fixture.nativeElement.querySelector('.banner.error');
    expect(banner?.textContent).toContain('not found');
  });
});
