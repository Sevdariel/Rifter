#!/usr/bin/env node
/**
 * Fetches Match-V5 fixtures for the analysis package.
 *
 * Downloads the N most recent matches for a Riot account from allowed queues
 * (solo/duo, flex, normal — ARAM excluded), sanitizes player identity to
 * deterministic placeholders, and writes combined match+timeline JSON to
 * `fixtures/matches/<matchId>.json`.
 *
 * Usage:
 *   node scripts/fetch-fixtures.mjs [--account 'Name#Tag'] [--count 9]
 *     [--region europe] [--out ../fixtures/matches]
 *
 * The Riot dev key is read from RIOT_API_KEY or from `apps/api/.env`.
 * Never commit raw (unsanitized) responses.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..', '..');
const DEFAULT_OUT = resolve(SCRIPT_DIR, '..', 'fixtures', 'matches');
const ENV_FILE = resolve(REPO_ROOT, 'apps', 'api', '.env');

/** Match-V5 queue ids: draft, solo/duo, blind, flex, quickplay (no ARAM 450). */
export const ALLOWED_QUEUES = new Set([400, 420, 430, 440, 490]);

function parseArgs(argv) {
  const args = { account: 'Sev#1864', count: 9, region: 'europe', out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    const value = argv[i + 1];
    if (!value) throw new Error(`Missing value for --${key}`);
    args[key] = key === 'count' ? Number.parseInt(value, 10) : value;
  }
  if (!Number.isInteger(args.count) || args.count <= 0) {
    throw new Error(`--count must be a positive integer, got '${args.count}'`);
  }
  args.out = resolve(process.cwd(), String(args.out));
  return args;
}

async function loadApiKey() {
  if (process.env.RIOT_API_KEY) return process.env.RIOT_API_KEY;
  let env;
  try {
    env = await readFile(ENV_FILE, 'utf8');
  } catch {
    throw new Error(`RIOT_API_KEY not in env and ${ENV_FILE} unreadable`);
  }
  const match = env.match(/^RIOT_API_KEY=(.+)$/m);
  if (!match) throw new Error(`RIOT_API_KEY not found in env or ${ENV_FILE}`);
  return match[1].trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function riotFetch(url, apiKey, attempt = 0) {
  const res = await fetch(url, { headers: { 'X-Riot-Token': apiKey } });
  if (res.status === 429) {
    if (attempt >= 3) throw new Error(`Rate limited repeatedly on ${url}`);
    const retryAfter = Number(res.headers.get('Retry-After') ?? '1');
    await sleep(retryAfter * 1000);
    return riotFetch(url, apiKey, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`Riot API ${res.status} on ${url}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * Builds a deterministic identity map: the account holder becomes
 * `puuid-target`/`TargetPlayer`, everyone else `puuid-N`/`PlayerN` ordered by
 * participantId. The same map applies to match and timeline payloads.
 */
export function buildIdentityMap(match, targetPuuid) {
  const map = new Map();
  const others = match.info.participants
    .map((p) => ({ participantId: p.participantId, puuid: p.puuid }))
    .sort((a, b) => a.participantId - b.participantId);
  let n = 1;
  for (const p of others) {
    if (p.puuid === targetPuuid) {
      map.set(p.puuid, { puuid: 'puuid-target', name: 'TargetPlayer', summoner: 'summoner-target' });
    } else {
      map.set(p.puuid, { puuid: `puuid-${n}`, name: `Player${n}`, summoner: `summoner-${n}` });
      n += 1;
    }
  }
  return map;
}

export function sanitizeMatch(match, identityMap) {
  const copy = structuredClone(match);
  copy.metadata.participants = copy.metadata.participants.map((p) => identityMap.get(p)?.puuid ?? 'puuid-x');
  for (const p of copy.info.participants) {
    const placeholder = identityMap.get(p.puuid) ?? {
      puuid: 'puuid-x',
      name: 'PlayerX',
      summoner: 'summoner-x',
    };
    p.puuid = placeholder.puuid;
    p.summonerName = placeholder.name;
    p.riotIdGameName = placeholder.name;
    p.riotIdTagline = 'TAG';
    p.summonerId = placeholder.summoner;
  }
  return copy;
}

export function sanitizeTimeline(timeline, identityMap) {
  const copy = structuredClone(timeline);
  copy.metadata.participants = copy.metadata.participants.map((p) => identityMap.get(p)?.puuid ?? 'puuid-x');
  for (const p of copy.info.participants) {
    p.puuid = identityMap.get(p.puuid)?.puuid ?? 'puuid-x';
  }
  return copy;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = await loadApiKey();
  const [gameName, tagLine] = args.account.split('#');
  if (!gameName || !tagLine) throw new Error(`--account must be 'Name#Tag', got '${args.account}'`);

  const api = (path) => `https://${args.region}.api.riotgames.com${path}`;

  const account = await riotFetch(
    api(`/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`),
    apiKey,
  );
  console.log(`Account ${gameName}#${tagLine} resolved.`);

  const matchIds = await riotFetch(
    api(`/lol/match/v5/matches/by-puuid/${account.puuid}/ids?start=0&count=${Math.min(args.count * 3, 100)}`),
    apiKey,
  );
  console.log(`${matchIds.length} recent match ids fetched, keeping ${args.count} from allowed queues.`);

  await mkdir(args.out, { recursive: true });
  let saved = 0;
  for (const matchId of matchIds) {
    if (saved >= args.count) break;
    const match = await riotFetch(api(`/lol/match/v5/matches/${matchId}`), apiKey);
    if (!ALLOWED_QUEUES.has(match.info.queueId)) {
      console.log(`  skip ${matchId} (queue ${match.info.queueId})`);
      continue;
    }
    const timeline = await riotFetch(api(`/lol/match/v5/matches/${matchId}/timeline`), apiKey);
    const identityMap = buildIdentityMap(match, account.puuid);
    const fixture = {
      matchId,
      queueId: match.info.queueId,
      match: sanitizeMatch(match, identityMap),
      timeline: sanitizeTimeline(timeline, identityMap),
    };
    await writeFile(resolve(args.out, `${matchId}.json`), JSON.stringify(fixture, null, 2));
    saved += 1;
    console.log(`  saved ${matchId} (queue ${match.info.queueId})`);
  }
  console.log(`Done: ${saved} fixtures written to ${args.out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
