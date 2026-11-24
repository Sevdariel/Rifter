import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { AppConfig } from '../config/app-config';
import { RifterApi } from './rifter-api';

const BASE = 'http://api.test';

describe('RifterApi', () => {
  let api: RifterApi;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AppConfig, useValue: { apiBaseUrl: BASE } },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(RifterApi);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('lists matches', async () => {
    const promise = api.listMatches();
    controller.expectOne(`${BASE}/matches`).flush([]);
    expect(await promise).toEqual([]);
  });

  it('encodes the match id in report and match URLs', async () => {
    const promise = api.getReport('EUW1_12/34');
    controller.expectOne(`${BASE}/reports/EUW1_12%2F34`).flush({});
    await promise;
  });

  it('posts the count to sync/recent', async () => {
    const promise = api.syncRecent(5);
    const req = controller.expectOne(`${BASE}/matches/sync/recent`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ count: 5 });
    req.flush({});
    await promise;
  });

  it('posts the match id to analysis/jobs', async () => {
    const promise = api.enqueueAnalysis('EUW1_1');
    const req = controller.expectOne(`${BASE}/analysis/jobs`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ matchId: 'EUW1_1' });
    req.flush({});
    await promise;
  });

  it('reads sync status', async () => {
    const promise = api.syncStatus();
    controller.expectOne(`${BASE}/matches/sync/status`).flush({ running: false });
    expect(await promise).toEqual({ running: false });
  });
});
