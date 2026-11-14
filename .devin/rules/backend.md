---
description: Backend NestJS rules
trigger: glob
globs:
  - 'apps/api/**/*.ts'
  - 'apps/api/**/*.json'
---

# Backend Rules

Follow repository-root `AGENTS.md` for scope, architecture, tests, and verification.

- Verify installed NestJS, Node, and database driver versions in the manifests and lockfile before applying version-specific guidance.
- Organize code in NestJS modules by domain (`auth`, `matches`, `replays`, `analysis`, `clips`, …). Each module owns its controllers, services, DTOs, entities, and tests. Cross-module access goes through exported providers, not deep imports.
- Controllers stay thin: validate input, delegate to services, map results. Validate every request DTO (class-validator or schema validation, whichever the project adopts) and enable whitelist/forbid-unknown behavior.
- Strict TypeScript, no `any`. Report and moment contracts come from `packages/analysis`; do not redeclare them.
- Returned values carry a named type and are returned via a typed variable (`const body: Foo = {...}; return body;`), not an inline literal. The same applies to object-literal call arguments: assign them to a typed variable first (`const input: FooInput = {...}; await svc.call(input);`).
- Every method carries an explicit access modifier (`public`/`protected`/`private`), including constructors.
- Types and interfaces used by a class live in their own file (`<feature>.types.ts`), not inline in controllers, services, or factories. Standalone helpers get their own file too (`<feature>.mapper.ts`, `<feature>.factory.ts`).
- Injected dependencies are named after their type in camelCase (`@Inject(DRIZZLE) private readonly databaseHandle: DatabaseHandle | null`, `private readonly riotClient: RiotClientService`).
- Express domain failures with typed exceptions carrying a stable error code, converted by one global exception filter. Never return raw error messages or stack traces to clients.
- Use the Nest `Logger`, never `console.log`. Never log tokens, API keys, RSO codes, or raw `.rofl` contents.
- Riot API access goes through one client service per Riot API family with rate-limit handling (`429` + `Retry-After`), regional routing, and caching of immutable data (finished matches). See `.devin/rules/riot-compliance.md`.
- LLM access goes through one provider-agnostic service defined by `packages/analysis` contracts. Model name, token limits, and timeouts come from configuration, not code constants.
- Every user-owned resource (matches, replays, reports, clips) is scoped to the authenticated player's PUUID. Check ownership in the service layer on every read and write (no IDOR).
- `.rofl` uploads: authenticated only, enforce size limit, verify the file signature before storage, store under a server-generated key (never a client-supplied path), and parse in the isolated parser service, never in the API process.
- Secrets come from environment variables or a secret store; never from tracked files.
- Long-running work (replay parsing, LLM analysis) runs as background jobs with idempotent handlers and status polling or events; HTTP requests do not block on it.
- Use Vitest for unit tests. Integration tests that need a database or object storage use disposable containers or in-memory equivalents, never shared or production resources.
- E2e specs that boot `AppModule`: `ConfigModule.forRoot(validate)` runs validation at module-evaluation time — set `process.env` **before** `await import('./app.module')` in `beforeAll` (static imports hoist above env assignment), and snapshot/restore prior env values in `afterAll`. Shared app wiring (helmet/CORS/etc.) lives in `app.configure.ts` so tests reuse it without running `bootstrap()`'s side effects.
