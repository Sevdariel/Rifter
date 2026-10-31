# Riot data sources and policy notes

Research snapshot from the project kickoff (2026-10-31). Riot changes APIs and policies; re-verify against the official sources before relying on a detail. Official docs: Riot Developer Portal (`developer.riotgames.com`), Developer Relations General Policies, League of Legends third-party application support article.

## Policy summary

- Riot does not tolerate apps that give a tangible in-game advantage, including apps that "make decisions for you" — the stated intent is that players play first and analyze and reflect after.
- Also forbidden: changing the information field (zoom hacks, global ultimate alerts), revealing intentionally hidden information, acting on the player's behalf (bots, scripts).
- Overlays tracking the player's own data or already-known information are an approved category; scouting tools are not.
- All products must be registered and audited in the Developer Portal; new features need audit. Monetization requires Riot approval. No crypto/NFT, no MMR boosting, no account trading, no alternatives to the game client.

## Live Client Data API

- `https://127.0.0.1:2999/liveclientdata/` — local HTTPS with a self-signed Riot certificate. Active only during a game or while watching a replay.
- `allgamedata` (everything), `activeplayer`, `playerlist`, `eventdata` (cumulative event list — poll and de-duplicate), `gamestats`.
- Swagger: `https://127.0.0.1:2999/swagger/v3/openapi.json` while the game runs.
- Replay API on the same port (`/replay/playback`, `/replay/render`) controls playback of a loaded replay: `time`, `paused`, `speed`. Used for "show in game" seek on desktop. It may need to be enabled in the game config; verify on the current patch.

## LCU API (League Client)

- Local, credentials from the client lockfile (port, password). Windows and macOS lockfile locations differ.
- Gameflow phase via REST and websocket events (lobby, champ select, in progress, end of game).
- Replay download: `POST /lol-replays/v1/rofls/{gameId}/download`. Replays are available only for a limited time (roughly until the patch changes).
- Read-only use only; scouting other players from lobby/champ select data is out of bounds.

## Riot Games API

- Match-V5: match detail and timeline (participant frames every 60 s, events: kills, wards, items, objectives, level-ups, skill-ups).
- Account-V1 (Riot ID to PUUID), Summoner-V4, League-V4, Champion-Mastery-V4.
- Development keys expire every 24 h with low limits (20 req/s, 100 req/2 min at the time of research). Production keys require product registration. RSO (Riot Sign-On) for player opt-in and account linking.
- Regional routing (americas/europe/asia/sea) for Match-V5 versus platform routing (euw1, na1, …) for other endpoints.

## `.rofl` replay files

- Binary, undocumented. ROFL2 format from patch 14.11. Payload encoding changes per patch.
- Open-source parsers at the time of research: `fraxiinus/roflxd.cs` (.NET, metadata for ROFL and ROFL2), `Mowokuma/ROFL` (Rust, archived; positions per second and wards), `ROFL-X` (Rust, extends Mowokuma's parser with a packet catalog). Check license compatibility and maintenance status before adopting one.
- Expect breakage on patch changes; keep per-patch fixtures and a parser version in stored results so replays can be re-parsed.

## Platform notes

- League of Legends runs on Windows and macOS. On Linux it does not run (Vanguard), so live capture targets Windows and macOS only; analysis and the web app are platform-independent.
