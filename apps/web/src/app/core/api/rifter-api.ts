import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AppConfig } from '../config/app-config';
import type {
  AnalysisJobView,
  EnqueueAnalysisResult,
  MatchSummary,
  ReportDetail,
  ReportSummary,
  SyncRecentResult,
  SyncStatus,
} from './api.models';

/** Typed client for the Rifter API. Base URL comes from the runtime config. */
@Service()
export class RifterApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfig);

  public listMatches(): Promise<MatchSummary[]> {
    return this.get(`${this.config.apiBaseUrl}/matches`);
  }

  public syncRecent(count: number): Promise<SyncRecentResult> {
    return this.post(`${this.config.apiBaseUrl}/matches/sync/recent`, { count });
  }

  public syncAll(): Promise<SyncStatus> {
    return this.post(`${this.config.apiBaseUrl}/matches/sync/all`, {});
  }

  public syncStatus(): Promise<SyncStatus> {
    return this.get(`${this.config.apiBaseUrl}/matches/sync/status`);
  }

  public enqueueAnalysis(matchId: string): Promise<EnqueueAnalysisResult> {
    return this.post(`${this.config.apiBaseUrl}/analysis/jobs`, { matchId });
  }

  public listJobs(): Promise<AnalysisJobView[]> {
    return this.get(`${this.config.apiBaseUrl}/analysis/jobs`);
  }

  public listReports(): Promise<ReportSummary[]> {
    return this.get(`${this.config.apiBaseUrl}/reports`);
  }

  public getReport(matchId: string): Promise<ReportDetail> {
    return this.get(`${this.config.apiBaseUrl}/reports/${encodeURIComponent(matchId)}`);
  }

  private get<T>(url: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(url));
  }

  private post<T>(url: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.post<T>(url, body));
  }
}
