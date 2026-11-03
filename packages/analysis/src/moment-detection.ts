import type { MomentCandidate } from './report-contract.js';
import { opposingTeam, securingTeam, type NormalizedMatch } from './normalized-match.js';

/**
 * Deterministic moment detection: produces candidate windows anchored to
 * timeline events. The LLM selects, ranks, and explains candidates — it
 * never invents windows, so every candidate is a window the pipeline is
 * willing to have narrated (and later clipped).
 *
 * All v1 detectors are `basic`-tier: they need only event timestamps and
 * team attribution, not sub-minute positions. Window sizes are heuristic
 * configuration, not measured precision — widening/narrowing them is a
 * detector-tuning change, not a contract change.
 */

/** Minimum data tier every v1 candidate kind is computed at. */
export const MOMENT_DETECTION_MIN_TIER = 'basic' as const;

/** Context window around a target death: 30 s lead-in, 10 s tail. */
export const DEATH_LOOKBACK_MS = 30_000;
export const DEATH_LOOKAHEAD_MS = 10_000;

/**
 * Champion kills land within this gap of each other to join one fight
 * cluster; a cluster needs TEAMFIGHT_MIN_KILLS to qualify.
 */
export const TEAMFIGHT_GAP_MS = 30_000;
export const TEAMFIGHT_MIN_KILLS = 3;
export const TEAMFIGHT_LOOKBACK_MS = 10_000;
export const TEAMFIGHT_LOOKAHEAD_MS = 15_000;

/**
 * A lost objective's window reaches back over kills up to this far before
 * the objective (fight context); without nearby kills it falls back to a
 * fixed lead-in.
 */
export const OBJECTIVE_FIGHT_LINK_MS = 60_000;
export const OBJECTIVE_KILL_LOOKBACK_MS = 10_000;
export const OBJECTIVE_FALLBACK_LOOKBACK_MS = 30_000;
export const OBJECTIVE_LOOKAHEAD_MS = 10_000;

export interface MomentDetectionResult {
  minTier: typeof MOMENT_DETECTION_MIN_TIER;
  candidates: MomentCandidate[];
}

function clampWindow(tStart: number, tEnd: number, durationMs: number): { t_start: number; t_end: number } {
  const t_end = Math.min(durationMs, Math.round(tEnd));
  // Events beyond the game duration collapse to a zero-width window at the
  // end rather than an inverted one that fails candidate validation.
  const t_start = Math.min(t_end, Math.max(0, Math.round(tStart)));
  return { t_start, t_end };
}

/** Champion-kill clusters: maximal runs where consecutive kills are <= gapMs apart. */
function killClusters(kills: { id: string; timestampMs: number }[], gapMs: number) {
  const clusters: { id: string; timestampMs: number }[][] = [];
  let current: { id: string; timestampMs: number }[] = [];
  for (const kill of kills) {
    const prev = current[current.length - 1];
    if (prev && kill.timestampMs - prev.timestampMs > gapMs) {
      clusters.push(current);
      current = [];
    }
    current.push(kill);
  }
  if (current.length > 0) clusters.push(current);
  return clusters;
}

/** Detects all v1 candidate windows for the target of one normalized match. */
export function detectMoments(match: NormalizedMatch): MomentDetectionResult {
  const target = match.participants.find((p) => p.isTarget);
  if (!target) {
    throw new Error('normalized match has no target participant');
  }
  const duration = match.gameDurationMs;
  const candidates: MomentCandidate[] = [];

  const championKills = match.events.flatMap((e) =>
    e.event.kind === 'champion-kill' ? [{ id: e.id, timestampMs: e.event.timestampMs }] : [],
  );
  const clusters = killClusters(championKills, TEAMFIGHT_GAP_MS);

  // death: every time the target dies.
  for (const { id, event } of match.events) {
    if (event.kind !== 'champion-kill' || event.victimId !== target.participantId) continue;
    const window = clampWindow(event.timestampMs - DEATH_LOOKBACK_MS, event.timestampMs + DEATH_LOOKAHEAD_MS, duration);
    candidates.push({ ...window, kind: 'death', anchorEventId: id });
  }

  // teamfight: kill clusters of >= TEAMFIGHT_MIN_KILLS, target involved or not.
  for (const cluster of clusters) {
    if (cluster.length < TEAMFIGHT_MIN_KILLS) continue;
    const window = clampWindow(
      cluster[0]!.timestampMs - TEAMFIGHT_LOOKBACK_MS,
      cluster[cluster.length - 1]!.timestampMs + TEAMFIGHT_LOOKAHEAD_MS,
      duration,
    );
    candidates.push({ ...window, kind: 'teamfight', anchorEventId: cluster[0]!.id });
  }

  // objective-lost: elite monsters and buildings secured by the enemy team,
  // with the window extended back over the fight that enabled them.
  const teamById = new Map(match.participants.map((p) => [p.participantId, p.team]));
  const enemyTeam = opposingTeam(target.team);
  for (const { id, event } of match.events) {
    let lostObjective = false;
    if (event.kind === 'monster-kill') {
      lostObjective = securingTeam(event, teamById) === enemyTeam;
    } else if (event.kind === 'building-kill') {
      lostObjective = event.ownerTeam === target.team;
    }
    if (!lostObjective) continue;

    const linkedKills = championKills.filter(
      (k) => event.timestampMs - k.timestampMs > 0 && event.timestampMs - k.timestampMs <= OBJECTIVE_FIGHT_LINK_MS,
    );
    // A linked fight extends the window to its first kill but never shrinks
    // below the fallback — a last-second kill still leaves full context.
    const lookback =
      linkedKills.length > 0
        ? Math.max(
            event.timestampMs - linkedKills[0]!.timestampMs + OBJECTIVE_KILL_LOOKBACK_MS,
            OBJECTIVE_FALLBACK_LOOKBACK_MS,
          )
        : OBJECTIVE_FALLBACK_LOOKBACK_MS;
    const window = clampWindow(event.timestampMs - lookback, event.timestampMs + OBJECTIVE_LOOKAHEAD_MS, duration);
    candidates.push({ ...window, kind: 'objective-lost', anchorEventId: id });
  }

  candidates.sort((a, b) => a.t_start - b.t_start || a.anchorEventId.localeCompare(b.anchorEventId));
  return { minTier: MOMENT_DETECTION_MIN_TIER, candidates };
}
