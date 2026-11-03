import type { MatchMetrics } from './metrics.js';
import type { MomentCandidate, ReportLocale } from './report-contract.js';
import {
  securingTeam,
  type NormalizedMatch,
  type NormalizedParticipant,
  type TimelineEvent,
} from './normalized-match.js';

/**
 * Versioned prompt building. Prompt templates live in `prompts/v<N>.md`
 * (kept for audit and later eval harness); the builder assembles
 * `template + deterministic facts`. The core is framework-free — callers
 * supply the template text (`readFileSync` in apps/tests), the builder
 * never touches the filesystem.
 *
 * Input is curated facts only: match context, metrics, moment candidates,
 * and the timeline events inside each candidate window. Participants are
 * described by team/position/champion — never identity. Candidates carry
 * raw `t_start`/`t_end` in milliseconds because snap validation requires
 * the LLM to echo them verbatim.
 */

/** Active prompt version; bump when the active `prompts/v<N>.md` changes. */
export const PROMPT_VERSION = 2;

/**
 * Maximum candidates sent to the model — keeps the prompt inside the
 * per-analysis token budget on kill-heavy games. Candidates are sorted by
 * `t_start`; overflow is dropped deterministically and noted in the prompt.
 */
export const MAX_PROMPT_CANDIDATES = 40;

export interface BuildPromptInput {
  match: NormalizedMatch;
  metrics: MatchMetrics;
  candidates: MomentCandidate[];
  locale: ReportLocale;
  /** Contents of `prompts/v${PROMPT_VERSION}.md`, loaded by the caller. */
  template: string;
}

export interface BuiltPrompt {
  prompt: string;
  promptVersion: number;
  locale: ReportLocale;
  /**
   * The candidates actually rendered into the prompt (sorted, capped at
   * MAX_PROMPT_CANDIDATES). Pass exactly this set to report validation so
   * snap semantics cover only what the model saw.
   */
  shownCandidates: MomentCandidate[];
}

const LOCALE_LANGUAGE: Record<ReportLocale, string> = { pl: 'Polish', en: 'English' };

function mmss(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function pct(v: number | null): string {
  return v === null ? 'unavailable' : `${(v * 100).toFixed(1)}%`;
}

function describe(p: NormalizedParticipant | undefined): string {
  if (!p) return 'unknown';
  const tag = p.isTarget ? 'TARGET' : p.team;
  return `${tag} ${p.position} ${p.championName}`;
}

function eventLine(
  e: TimelineEvent,
  byId: Map<number, NormalizedParticipant>,
  teamById: ReadonlyMap<number, 'blue' | 'red'>,
): string | null {
  const ev = e.event;
  const t = mmss(ev.timestampMs);
  switch (ev.kind) {
    case 'champion-kill': {
      const killer = describe(byId.get(ev.killerId ?? -1));
      const victim = describe(byId.get(ev.victimId));
      const assists =
        ev.assistingIds.length > 0
          ? ` (assists: ${ev.assistingIds.map((id) => describe(byId.get(id))).join(', ')})`
          : '';
      return `${t} ${killer} killed ${victim}${assists}`;
    }
    case 'monster-kill': {
      const monster = ev.monsterSubType ? `${ev.monsterType} (${ev.monsterSubType})` : ev.monsterType;
      const team = securingTeam(ev, teamById) ?? 'no team';
      return `${t} ${team} secured ${monster}`;
    }
    case 'building-kill':
      return `${t} ${ev.ownerTeam} lost ${ev.buildingType}${ev.laneType ? ` ${ev.laneType}` : ''}${ev.towerType ? ` (${ev.towerType})` : ''}`;
    case 'ward-placed':
      // Placement spam adds noise, not coaching signal, inside a window.
      return null;
  }
}

function fmt(v: number | null, digits = 1): string {
  return v === null ? 'unavailable' : v.toFixed(digits);
}

/** Assembles `template + rendered facts` into the final prompt string. */
export function buildPrompt(input: BuildPromptInput): BuiltPrompt {
  const { match, metrics, candidates, locale, template } = input;
  const byId = new Map(match.participants.map((p) => [p.participantId, p]));
  const teamById = new Map(match.participants.map((p) => [p.participantId, p.team]));
  const target = match.participants.find((p) => p.isTarget);
  const tierNote =
    match.dataTier === 'basic' ? 'positions sampled every 60 s' : 'positions sampled every 1 s, wards available';

  const sections: string[] = [template.trimEnd()];

  sections.push(`## Match context
Match: ${match.matchId}
Patch: ${match.patch}
Queue: ${match.queueId}
Duration: ${mmss(match.gameDurationMs)}
Data tier: ${match.dataTier} (${tierNote})
Target: ${describe(target)}`);

  sections.push(`## Metrics (target player)
CS/min: ${fmt(metrics.csPerMin)}
Kill participation: ${pct(metrics.killParticipation)}
Damage share: ${pct(metrics.damageShare)}
Vision score: ${metrics.visionScore} (${fmt(metrics.visionPerMin)}/min)
Gold diff at 15 min: ${metrics.goldDiffAt15 ?? 'unavailable'}
Deaths: ${metrics.deaths.length} (early ${metrics.deathPhases.early}, mid ${metrics.deathPhases.mid}, late ${metrics.deathPhases.late})
Objective participation: ${metrics.objectives.participated}/${metrics.objectives.teamObjectives} of team objectives${metrics.objectives.share === null ? ' (share unavailable)' : ` (${pct(metrics.objectives.share)})`}`);

  const shown = [...candidates]
    .sort((a, b) => a.t_start - b.t_start || a.anchorEventId.localeCompare(b.anchorEventId))
    .slice(0, MAX_PROMPT_CANDIDATES);
  const omitted = candidates.length - shown.length;
  const candidateLines = shown.map((c, i) => {
    const windowEvents = match.events.filter((e) => e.event.timestampMs >= c.t_start && e.event.timestampMs <= c.t_end);
    const lines = windowEvents.flatMap((e) => {
      const line = eventLine(e, byId, teamById);
      return line === null ? [] : [`  - ${line}`];
    });
    const kind = c.kind === 'teamfight' ? 'teamfight (kill cluster)' : c.kind;
    return `[${i}] ${kind} ${mmss(c.t_start)}–${mmss(c.t_end)}  t_start=${c.t_start} t_end=${c.t_end}\n${lines.join('\n')}`;
  });
  const omittedNote = omitted > 0 ? `\n\n(${omitted} further candidates omitted to fit the prompt budget)` : '';
  sections.push(`## Moment candidates\n${candidateLines.join('\n\n')}${omittedNote}`);

  // Language directive sits last: recency position keeps small models from
  // drifting back to English over a long candidates section.
  sections.push(`## Output language
Write all prose fields (summary, label, mistake, fix) in ${LOCALE_LANGUAGE[locale]}.`);

  return { prompt: sections.join('\n\n'), promptVersion: PROMPT_VERSION, locale, shownCandidates: shown };
}
