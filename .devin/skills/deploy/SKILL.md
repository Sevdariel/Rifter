---
name: deploy
description: Verify and deploy LolGameReviewer components to an explicitly confirmed environment
triggers:
  - user
---

# Deploy Workflow

No deployment target is defined yet. Until hosting for the API, web app, parser service, object storage, and desktop release channel is decided and documented, stop at step 1 and ask the user.

1. Read repository-root `AGENTS.md`, the deployment documentation, and the relevant deployment scripts and CI workflows. Inspect scripts before execution; do not assume their defaults are the intended targets. If no documented target exists, stop and ask.
2. Confirm the requested components, environment, target resources, and artifact or revision. Present the exact cloud-changing commands, release-publishing actions, or CI actions and wait for explicit approval before executing them.
3. Apply `.devin/skills/orchestrate/SKILL.md` to identify changes included in the artifact or revision and verify required independent code, security, Riot compliance, AI analysis, and Rust review evidence for those exact inputs. If evidence is missing, stale, or blocked, obtain the required review before proceeding; deployment approval is not a gate waiver. Invoke `run-tests` for the deployed components. Stop if required builds, tests, or gates fail or are blocked.
4. Production builds must use a registered Riot production key provided by the secret store, never a development key. Desktop releases must be signed for Windows and notarized for macOS through the approved release path.
5. Execute only the approved deployment actions. Do not print or modify production secrets, API keys, or connection strings.
6. Run read-only smoke checks against the confirmed environment. On failure, stop and report the deployed revision and proposed recovery; obtain separate approval for rollback or destructive actions.
7. Report deployment and smoke-test results. Do not commit or push repository changes as part of deployment.
