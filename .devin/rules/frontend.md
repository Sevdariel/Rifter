---
description: Frontend Angular rules
trigger: glob
globs:
  - "apps/web/**/*.ts"
  - "apps/web/**/*.html"
  - "apps/desktop/src/**/*.ts"
  - "apps/desktop/src/**/*.html"
  - "packages/ui/**/*.ts"
  - "packages/ui/**/*.html"
---

# Frontend Rules

Follow repository-root `AGENTS.md` for scope, architecture, tests, and verification.

- Do not implement a component or view before the user has accepted its Figma design (`.devin/rules/design-acceptance.md`).
- Verify installed versions in the frontend manifests and lockfile before applying version-specific guidance.
- Before Angular work, discover the available MCP tools and use Angular MCP `list_projects` and `get_best_practices` for the target workspace. If required tools are unavailable, report the blocker rather than inventing tool names or results.
- Follow the `angular-developer` skill for the installed version.
- Use standalone components with the version's default change detection; do not add redundant `standalone: true`.
- Use `signal()` for local state and `computed()` for derived state. Retain RxJS for asynchronous streams (live event feeds, upload progress).
- When using `httpResource`/`resource`, consume its native fields (`status`, `isLoading`, `hasValue`, `error`, `reload`) directly instead of adding mirror computeds.
- Use `input()`/`output()` for component APIs and `inject()` for dependencies. HTTP calls live in dedicated API services, never in components or facades.
- Strict TypeScript, no `any`; use `unknown` when a type is uncertain. Type API contracts with dedicated models that match the backend and `packages/analysis` contracts, including nullability. Import report/moment types from `packages/analysis`; never redeclare them.
- Do not prefix interface or type names with `I`. Declare explicit access modifiers on class members; use `protected` for template-only members.
- Native control flow (`@if`, `@for`, `@switch`); `[class.*]`/`[style.*]` bindings instead of `ngClass`/`ngStyle`. Prefer the `host` metadata object over `@HostBinding`/`@HostListener`.
- Use Signal Forms for new forms where stable in the installed version.
- External `templateUrl` and `styleUrl` files for every component (spec test hosts exempt). Keep interfaces and type aliases in `*.model.ts` files.
- Keep signal stores state-only. Facades orchestrate data (API services, store updates, navigation) only; view-local UI state stays in the component. Never nest `.subscribe()` calls.
- Organize features under `src/app/<feature>/`. Code shared by desktop and web belongs in `packages/ui`, not duplicated across apps. App-only code stays in its app.
- Platform access in the desktop UI goes through a single Tauri bridge service per capability (wrapping `invoke()` and event listeners). Components never call `invoke()` directly. Shared `packages/ui` components never import Tauri APIs; they take data through inputs so they also run on the web.
- Every match view shows the data tier (`basic` / `full`). Sections needing `full` data are disabled with an explanation when the tier is `basic`, never hidden silently or filled with fabricated data.
- The live-game view displays only the player's own visible stats and capture status. It shows no advice or analysis (see `.devin/rules/riot-compliance.md`).
- Do not use `document.querySelector*`/`getElementById` in components; use `ElementRef`, template refs, or `viewChild()`. Canvas/WebGL code for the 2D replay player is scoped to the component's own element.
- After template migrations that swap markup or grid/style definitions, compare a screenshot against the pre-change baseline for every affected state.
- Ensure WCAG AA accessibility: ARIA, focus management, color contrast, keyboard support. The 2D replay player needs keyboard controls (play/pause, seek) and a text alternative listing the moment's events.
- Use the existing Vitest test target. Drive component inputs through `fixture.componentRef.setInput()` in specs.
- Before Figma bridge work, run the cheapest connectivity check and ask the user to enable the plugin when disconnected.
- Report external-service blockers (auth, credentials, disconnected bridges) to the user immediately on first failure.
