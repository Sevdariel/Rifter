import { Injectable } from "@nestjs/common";

import type { SyncStatus } from "./matches.types";

const IDLE: SyncStatus = {
  running: false,
  done: false,
  listed: 0,
  fetched: 0,
  stored: 0,
  skippedCached: 0,
  skippedNonSr: 0,
  failed: 0,
};

/**
 * In-memory progress for the background all-sync. Lost on restart by design —
 * the sync is resumable because cached matches are immutable and skipped.
 */
@Injectable()
export class SyncStatusService {
  private status: SyncStatus = { ...IDLE };

  public snapshot(): SyncStatus {
    const copy: SyncStatus = { ...this.status };
    return copy;
  }

  public begin(): void {
    this.status = { ...IDLE, running: true };
  }

  public count(field: "listed" | "fetched" | "stored" | "skippedCached" | "skippedNonSr" | "failed", by = 1): void {
    this.status[field] += by;
  }

  public finish(lastError?: string): void {
    this.status = { ...this.status, running: false, done: true, lastError };
  }
}
