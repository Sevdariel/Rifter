import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { RifterApi } from '../../core/api/rifter-api';
import type {
  AnalysisJobView,
  MatchSummary,
  ReportSummary,
  SyncStatus,
} from '../../core/api/api.models';
import { AppConfig } from '../../core/config/app-config';
import { formatGameTime } from '../../core/time/game-time';

interface MatchRow {
  match: MatchSummary;
  report: ReportSummary | null;
  job: AnalysisJobView | null;
}

const QUEUE_NAMES: Readonly<Record<number, string>> = {
  400: 'Normal Draft',
  420: 'Ranked Solo',
  430: 'Normal Blind',
  440: 'Ranked Flex',
  490: 'Quickplay',
  700: 'Clash',
};

const POLL_MS = 3000;
const SYNC_RECENT_COUNT = 5;

/** Dev-only match list: sync controls, analysis enqueue, job status, report links. */
@Component({
  selector: 'app-match-list',
  imports: [DatePipe, RouterLink],
  templateUrl: './match-list.html',
  styleUrl: './match-list.scss',
})
export class MatchList {
  private readonly api = inject(RifterApi);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly config = inject(AppConfig);

  protected readonly matches = signal<MatchSummary[]>([]);
  protected readonly reports = signal<ReportSummary[]>([]);
  protected readonly jobs = signal<AnalysisJobView[]>([]);
  protected readonly syncStatus = signal<SyncStatus | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly rows = computed<MatchRow[]>(() => {
    const reportsByMatch = new Map(this.reports().map((r) => [r.matchId, r]));
    const latestJobByMatch = new Map<string, AnalysisJobView>();
    for (const job of this.jobs()) {
      const existing = latestJobByMatch.get(job.matchId);
      if (!existing || job.createdAt > existing.createdAt) {
        latestJobByMatch.set(job.matchId, job);
      }
    }
    return this.matches()
      .map((match) => ({
        match,
        report: reportsByMatch.get(match.matchId) ?? null,
        job: latestJobByMatch.get(match.matchId) ?? null,
      }))
      .sort((a, b) => (b.match.gameCreationMs ?? 0) - (a.match.gameCreationMs ?? 0));
  });

  public constructor() {
    void this.refresh();
    const timer = setInterval(() => void this.poll(), POLL_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  protected queueName(queueId: number): string {
    return QUEUE_NAMES[queueId] ?? `Queue ${queueId}`;
  }

  protected duration(seconds: number | null): string {
    return seconds === null ? '—' : formatGameTime(seconds * 1000);
  }

  protected async refresh(options?: { preserveError?: boolean }): Promise<void> {
    if (!options?.preserveError) {
      this.error.set(null);
    }
    try {
      const [matches, reports, jobs, syncStatus] = await Promise.all([
        this.api.listMatches(),
        this.api.listReports(),
        this.api.listJobs(),
        this.api.syncStatus(),
      ]);
      this.matches.set(matches);
      this.reports.set(reports);
      this.jobs.set(jobs);
      this.syncStatus.set(syncStatus);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    }
  }

  protected async syncRecent(): Promise<void> {
    await this.runAction(() => this.api.syncRecent(SYNC_RECENT_COUNT));
  }

  protected async syncAll(): Promise<void> {
    await this.runAction(() => this.api.syncAll());
  }

  protected async analyze(matchId: string): Promise<void> {
    await this.runAction(() => this.api.enqueueAnalysis(matchId));
  }

  private async runAction(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
      // Keep a just-set action error visible — refresh() must not wipe it.
      await this.refresh({ preserveError: true });
    }
  }

  /** Refreshes volatile state while a sync or analysis job is in flight. */
  private async poll(): Promise<void> {
    const syncRunning = this.syncStatus()?.running === true;
    const jobsActive = this.jobs().some((j) => j.status === 'queued' || j.status === 'running');
    if (!syncRunning && !jobsActive) {
      return;
    }
    try {
      const succeededBefore = new Set(
        this.jobs()
          .filter((j) => j.status === 'succeeded')
          .map((j) => j.id),
      );
      const [jobs, syncStatus] = await Promise.all([this.api.listJobs(), this.api.syncStatus()]);
      this.jobs.set(jobs);
      this.syncStatus.set(syncStatus);
      if (syncRunning && !syncStatus.running) {
        // A finished background sync may have stored new matches.
        this.matches.set(await this.api.listMatches());
      }
      if (jobs.some((j) => j.status === 'succeeded' && !succeededBefore.has(j.id))) {
        this.reports.set(await this.api.listReports());
      }
    } catch {
      // Poll failures are transient — the next tick retries.
    }
  }
}
