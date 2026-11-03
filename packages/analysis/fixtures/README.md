# Match fixtures

Sanitized Match-V5 responses used by metrics, moment-detection, and golden tests.

## Format

`matches/<matchId>.json` — one file per match, plain JSON (diff-friendly):

```json
{
  "matchId": "EUN1_...",
  "queueId": 420,
  "match": { "...": "raw Match-V5 /lol/match/v5/matches/{id} body" },
  "timeline": { "...": "raw Match-V5 .../timeline body" }
}
```

Queues: only solo/duo (420), flex (440), and normal (400/430/490). ARAM is excluded by product decision.

## Sanitization (privacy)

Player identity is replaced with deterministic placeholders at fetch time — raw responses are never committed:

- the account holder → `puuid-target` / `TargetPlayer` / `summoner-target`
- other participants → `puuid-N` / `PlayerN` / `summoner-N` (ordered by `participantId`), `riotIdTagline` → `TAG`
- applies to `metadata.participants`, `info.participants[].puuid|summonerId|summonerName|riotIdGameName|riotIdTagline`, and both `timeline.metadata.participants` and `timeline.info.participants[].puuid`

**Accepted exposure:** real `matchId` values (filenames, `matchId` field, `gameName`) are retained intentionally — fixtures must reference real matches so the pipeline can re-fetch or cross-check data. Anyone holding a valid Riot key can re-fetch the unsanitized payload for these match IDs; the repository stays private and the account is the owner's own.

`fixtures.spec.ts` asserts the invariant on every committed file — a fixture with real identity values fails the suite.

## Regenerating

Requires `RIOT_API_KEY` in env or `apps/api/.env` (dev key, never committed):

```sh
pnpm -C packages/analysis fetch-fixtures             # 9 most recent, Sev#1864
node scripts/fetch-fixtures.mjs --account 'Name#Tag' --count 9 --region europe
```

Respects `429`/`Retry-After`. Uses the regional routing host (`europe` covers EUW+EUNE).
