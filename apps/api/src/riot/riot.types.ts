/** account-v1 response subset. */
export interface RiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

/** A sliding-window rate cap, e.g. `{limit: 100, windowMs: 120_000}`. */
export interface RateWindow {
  limit: number;
  windowMs: number;
}

export type Sleep = (ms: number) => Promise<void>;

/** Query params for the match ids list endpoint. */
export interface ListMatchIdsParams {
  start?: number;
  count?: number;
  /** Epoch seconds; matches before this are excluded. */
  startTime?: number;
}
