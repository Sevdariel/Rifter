---
description: Riot Games policy boundary for data collection, live features, and AI output
trigger: always_on
---

# Riot Compliance Rules

Background, sources, and endpoint notes: `.devin/references/riot-data-sources.md`. Re-check the cited Riot policies when they may have changed; do not rely on memory.

## Live phase (a game is in progress)

- Allowed: read-only polling of the Live Client Data API (`https://127.0.0.1:2999/liveclientdata/*`), buffering events and stats locally, showing the player's own already-visible stats (for example CS, gold, KDA) without interpretation.
- Forbidden: any AI- or rule-generated advice, warnings, predictions, win probabilities, or "what to do now" output while the game is running. Riot's policy is "play first, analyze after".
- Forbidden: hidden information, meaning anything the player cannot see in the game client — fog-of-war positions, enemy cooldowns or summoner spell timers not shown by the client, jungle timers derived from hidden data.
- Forbidden: input automation, macros, scripted actions, memory reading, packet interception, client file modification, injecting into the game process.
- The AI pipeline must not run against an in-progress game. Gate analysis on the LCU gameflow phase or on game end, not on a timer.

## Pre-game and lobby

- Forbidden: scouting other players (opponents or teammates) in champ select or loading screen — rank, match history, or performance lookups of players other than the authenticated user.
- LCU usage is read-only for the authenticated player's own state, plus `POST /lol-replays/v1/rofls/{gameId}/download` for the player's own games.

## Post-game

- Allowed: full analysis of the player's own games from Match-V5, Live Client Data captures, and the player's own `.rofl` files.
- Replays: only the authenticated player's games. Do not build a public replay library of other players' games.

## Riot API usage

- Respect rate limits (`429` with `Retry-After`); never parallelize past documented limits or rotate keys to evade them.
- Production use requires a registered product in the Riot Developer Portal and RSO for player opt-in. Development keys expire every 24 hours and must never ship in a build.
- Use Data Dragon / Community Dragon for static assets and follow Riot's legal notice requirements in the UI.
- No MMR/ELO boosting, account trading, gambling, crypto/NFT features, or reselling Riot data.

## Process

- Any change touching data collection, live UI, LCU calls, replay handling, or AI output timing goes through the independent `riot-compliance-reviewer` gate.
- When a requirement conflicts with these rules, stop and ask the user. Do not implement a "hidden" or "debug-only" variant of a forbidden feature.
