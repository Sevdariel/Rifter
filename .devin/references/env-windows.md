# Windows Environment Quirks

Toolchain facts discovered on this machine (Windows 11, MSYS shell, nvm4w Node). Read before probing — do not rediscover.

## Toolchain

- `gh` is not on PATH in MSYS. Use `"C:/Program Files/GitHub CLI/gh.exe"` (`.devin/skills/github/SKILL.md` is canonical).
- `npm`/`pnpm` shims need the `.cmd` suffix when the shell resolves `.ps1`: `npm.cmd`, `pnpm.cmd`. Do not change execution policy.
- Node 26 (nvm4w) has **no corepack**, and neither does the `node:26` image. Install pnpm with `npm i -g pnpm@<pin>` — never `corepack enable`, including in Dockerfiles.
- WSL is broken on this machine (`execvpe(/bin/bash) failed`) — do not probe WSL paths.
- Docker Desktop may be stopped — check `docker info` / `docker ps` before builds instead of discovering at `compose up`.
- `find` is Windows FIND (parameter errors on Unix flags) — use the `grep`/`find_file_by_name` tools, not `find`.
- pnpm 12 requires build-script approval: `ERR_PNPM_IGNORED_BUILDS` → run `pnpm approve-builds` once; it writes `allowBuilds` in `pnpm-workspace.yaml` (the key is `allowBuilds`, not `onlyBuiltDependencies`).
- `postgres:18+` mounts the named volume at `/var/lib/postgresql`, not `/var/lib/postgresql/data` (layout changed from earlier majors).

## Docker authoring

- `.dockerignore` patterns do not cross `/` automatically — `**/.env` and `**/.env.*` (with `!**/.env.example`) are required to keep nested env files out of the build context; verify with a decoy `.env` in the built image.
- Runtime images should pin `"files": ["dist"]` in the app manifest so `pnpm deploy` only ships build output, and run `USER node`.
- Env vars validated by zod `min(1)` must be omitted from compose entirely — empty strings fail startup validation.

## Output discipline

- `npm view <pkg> version` for latest, `npm view <pkg> time.<version>` for one publish date — never the full `time` table.
- Prefer `gh ... --json <fields> -q <jq>` over guessing field names (guesses print long `Unknown JSON field` errors).
- `gh <cmd> --help` once per command per thread.
- Long build/pull output: run with `--quiet`/tail where possible instead of streaming full logs.
