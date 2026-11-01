---
description: Figma design acceptance gate — no view implementation before user-accepted designs
trigger: always_on
---

# Design Acceptance Rules

Implementation of UI (components and views) starts only after the user has accepted the matching design in Figma. The agent never accepts a design itself.

## Figma source

- File: `Rifter` (file key `l34FZ4ZhQpkOc172pkcjfs`).
- Design system page: `https://www.figma.com/design/l34FZ4ZhQpkOc172pkcjfs/Rifter?node-id=1-2` (bridge node ID `1:2`).
- Views page: `https://www.figma.com/design/l34FZ4ZhQpkOc172pkcjfs/Rifter?node-id=0-1` (bridge node ID `0:1`).
- Node IDs in URLs use `-`; the bridge uses `:`. Verify the mapping with `figma_get_context` before writing.

## Order (strict)

1. **Design system first.** Every single element (buttons, inputs, tables, modals, badges, tier badges, icons, navigation items, toasts) is designed and accepted on the design system page before it is used in any view.
2. **Views second.** Views are composed only from accepted design-system components. A view that needs a new element adds it to the design system first, and that element is accepted before the view is submitted.
3. **Implementation last.** A component or view is implemented in code only when its Figma design has been accepted by the user. A component that exists in Figma but is not accepted is not accepted.

## Acceptance

- Only the user accepts. Reviewers, figma-designer, the root agent, and tests do not accept designs. Review reports are evidence, not acceptance.
- Submit a design by stating the Figma node IDs, the view or component name, the reference evidence used, and open questions. Then wait for the user's answer.
- Record an acceptance only after an explicit user message approving the named node (for example "accept 1:2" or "zaakceptowane"). Then append one line to `docs/design/acceptance.md`: date, node ID, name, user confirmation quote. Ambiguous replies ("ok, zobaczymy") are not acceptance; ask again.
- A rejected or changed design returns to draft. Any later change to an accepted node reopens it: the node needs a new acceptance before dependent views are implemented.
- Acceptance is per node version. If an accepted component changes, views using it need re-acceptance when their appearance changes.

## Implementation gate

Before writing UI code for a component or view, the root checks:

1. The `docs/design/acceptance.md` log contains the node ID and the user's confirmation.
2. Every element the view uses is an accepted design-system component.
3. The code change references the accepted node ID in the commit message or PR description.

If any check fails, stop and ask the user. Do not implement from an unaccepted or partially accepted design, and do not implement from component source alone.

## Working with figma-designer

- The `figma-designer` profile builds designs in the order above and works from reference screenshots of the running app, or from the user's brief when there is no existing UI.
- The figma-designer report lists the node IDs it created or changed and says the design is `draft`. It does not claim acceptance.
- Visual reviews (`ux-reviewer` or independent review) compare exports against references before the design goes to the user. The user remains the final acceptance step.

## Scope

- This gate covers UI design and implementation (`apps/web`, `apps/desktop`, `packages/ui`). It does not block backend, analysis, or Rust work that has no UI.
- Explicitly marked dev-only harness or debug views (for example the pre-design report dev-harness in `apps/web`) are exempt; a dev-harness promoted to product UI loses the exemption and then needs an accepted design.
- The 2D replay player, live-capture overlays, and any view showing game data also pass the Riot compliance rules in `riot-compliance.md`. Acceptance in Figma does not waive that gate.
