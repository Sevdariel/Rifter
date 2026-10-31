---
name: capture-refs
description: Capture reference screenshots and view data from the running desktop or web app for Figma baselines and visual verification
triggers:
  - user
  - model
---

# Capture Reference Views

Visual reference evidence for Figma work. Produces the screenshots that the `figma-designer` contract and the `ux-reviewer` gate require. See [orchestration protocol](../orchestrate/SKILL.md) for the gates this evidence feeds.

## Constraints

- Playwright is not approved tooling in this repository. Do not add it.
- Fully autonomous where possible: do not ask the user to click through the app for capture purposes.
- Credentials come from environment variables or local secrets; never hardcode them and never write them into committed scripts.
- Capture against demo or anonymized match data. Never capture screens showing real Riot IDs of other players, tokens, or account details.

## Web app

1. The dev server must be running (start an extra instance on a free port if the user's own instance should stay untouched). Use the local backend with seeded demo matches.
2. Launch Chrome with `--remote-debugging-port` and drive it over CDP: authenticate through the app's dev auth path, navigate routes, and trigger interactive states through DOM events. Keep CDP helpers dependency-free and out of production code.
3. `Page.captureScreenshot` per planned state; use `captureBeyondViewport` for full-page frames. Viewports: desktop `1440x900`, mobile `390x844`. For layout verification, measure `getBoundingClientRect`/`getComputedStyle` rather than eyeballing screenshots.
4. For full-page mobile captures, also capture a viewport-only shot of the top ~600px so controls stay readable.

## Desktop app

- Prefer capturing the desktop UI by serving its Angular build in Chrome with the Tauri bridge replaced by a fixture-backed mock, then follow the web steps. Window sizes: `1280x800` and the minimum supported window size.
- When the real webview is required (WebView2/WKWebView-specific rendering), take OS-level window screenshots and record the platform and window size with each file.
- Live-capture states are captured from recorded fixtures, never from a running ranked game.

## Manifest (write before capturing)

Enumerate every state as `app x route x viewport x interactive state x data tier` mapped to an output file — e.g. match list, report (`basic`), report (`full`), moment fragment playing, sync in progress, sync failed, settings. The manifest is the acceptance checklist for completeness.

After capture, write a **control inventory** per view: every observable element in the reference in order. Resolve unclear elements from component source before the spec is written. The `figma-designer` spec must map every inventory item to a planned node or mark it `omitted`.

Capture the underlying data alongside the images (API responses or fixtures per view).

## Storage

Save refs to `.figma-refs/<feature>/` (gitignored). Never `/tmp`. Save Figma export previews to `.figma-refs/<feature>/figma/` beside the references.
