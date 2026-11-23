import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { RifterApi } from '../../core/api/rifter-api';
import type { MatchSummary, ReportSummary } from '../../core/api/api.models';
import { AppConfig } from '../../core/config/app-config';
import { MatchList } from './match-list';

const MATCH: MatchSummary = {
  matchId: 'EUW1_1',
  queueId: 420,
  gameCreationMs: 1_700_000_000_000,
  gameDurationSec: 1800,
  fetchedAt: '2026-11-20T10:00:00.000Z',
};

const REPORT: ReportSummary = {
  matchId: 'EUW1_1',
  dataTier: 'basic',
  locale: 'pl',
  contractVersion: 1,
  promptVersion: 1,
  modelDigest: 'sha256:abc',
  summary: 's',
  gameCreationMs: 1_700_000_000_000,
  updatedAt: '2026-11-20T11:00:00.000Z',
};

function fakeApi(overrides: Partial<RifterApi> = {}): Partial<RifterApi> {
  return {
    listMatches: vi.fn(async () => [MATCH]),
    listReports: vi.fn(async () => [REPORT]),
    listJobs: vi.fn(async () => []),
    syncStatus: vi.fn(async () => ({
      running: false,
      done: true,
      listed: 1,
      fetched: 1,
      stored: 1,
      skippedCached: 0,
      skippedNonSr: 0,
      failed: 0,
    })),
    syncRecent: vi.fn(async () => ({
      requested: 5,
      stored: 1,
      skippedCached: 0,
      skippedNonSr: 0,
      matchIds: ['EUW1_1'],
    })),
    syncAll: vi.fn(async () => ({
      running: true,
      done: false,
      listed: 0,
      fetched: 0,
      stored: 0,
      skippedCached: 0,
      skippedNonSr: 0,
      failed: 0,
    })),
    enqueueAnalysis: vi.fn(async () => ({ job: {} as never, created: true })),
    ...overrides,
  };
}

async function setup(api: Partial<RifterApi>, isConfigured = true) {
  await TestBed.configureTestingModule({
    imports: [MatchList],
    providers: [
      { provide: RifterApi, useValue: api },
      { provide: AppConfig, useValue: { isConfigured } },
      provideRouter([]),
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(MatchList);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('MatchList', () => {
  it('renders match rows with queue, tier and report link', async () => {
    const fixture = await setup(fakeApi());
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('EUW1_1');
    expect(text).toContain('Ranked Solo');
    expect(text).toContain('30:00');
    const tier = fixture.nativeElement.querySelector('.tier');
    expect(tier?.textContent?.trim()).toBe('basic');
    const link = fixture.nativeElement.querySelector('a[href="/dev/reports/EUW1_1"]');
    expect(link).toBeTruthy();
  });

  it('shows the empty state when no matches are stored', async () => {
    const fixture = await setup(fakeApi({ listMatches: vi.fn(async () => []) }));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No matches stored');
  });

  it('warns when the API token is not configured', async () => {
    const fixture = await setup(fakeApi(), false);
    const banner = fixture.nativeElement.querySelector('.banner.warn');
    expect(banner?.textContent).toContain('config.local.json');
  });

  it('enqueues analysis and refreshes on Analyze', async () => {
    const api = fakeApi();
    const fixture = await setup(api);
    const button = fixture.nativeElement.querySelector('.actions button') as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    expect(api.enqueueAnalysis).toHaveBeenCalledWith('EUW1_1');
    expect(api.listJobs).toHaveBeenCalled();
  });

  it('keeps a failed action error visible after the follow-up refresh', async () => {
    const api = fakeApi({ enqueueAnalysis: vi.fn(async () => Promise.reject(new Error('429'))) });
    const fixture = await setup(api);
    const button = fixture.nativeElement.querySelector('.actions button') as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const banner = fixture.nativeElement.querySelector('.banner.error');
    expect(banner?.textContent).toContain('429');
    expect(api.listMatches).toHaveBeenCalledTimes(2);
  });

  it('shows API errors in the alert banner', async () => {
    const api = fakeApi({ listMatches: vi.fn(async () => Promise.reject(new Error('boom'))) });
    const fixture = await setup(api);
    const banner = fixture.nativeElement.querySelector('.banner.error');
    expect(banner?.textContent).toContain('boom');
  });
});
