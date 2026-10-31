---
description: CSS/SCSS styling rules
trigger: glob
globs:
  - "apps/web/**/*.scss"
  - "apps/web/**/*.css"
  - "apps/desktop/src/**/*.scss"
  - "apps/desktop/src/**/*.css"
  - "packages/ui/**/*.scss"
  - "packages/ui/**/*.css"
---

# CSS Rules

Follow repository-root `AGENTS.md` and `.devin/rules/frontend.md` for scope and conventions.

- Use only whole, even numeric values for sizes in `px`, `rem`, `em`, etc. — no fractional values like `13.5px` and no odd values like `1px` or `11px`. The rule also covers arbitrary utility values in new code.
- Never use a universal reset (`* { margin: 0 }`, `* { padding: 0 }`) in component SCSS; after emulated encapsulation it overrides utility classes. `* { box-sizing: border-box }` alone is fine.
- When editing a `grid-template-columns` shared by several rows (header + data rows), `auto`/`min-content`/`max-content` tracks resolve per container. Use fixed tracks when columns must align, and verify every row sharing the template, including media-query variants.
- Put `:host` styles in the component's own `.scss` file, not in `host` metadata.
- Attach exactly one `.scss` file per component via `styleUrl`.
- Shared design tokens (colors, spacing, typography) live in `packages/ui` and are consumed by both apps. Do not hardcode token values in app styles.
- The desktop app renders in the OS webview (WebView2 on Windows, WKWebView on macOS). Avoid CSS features unsupported by the minimum supported WKWebView version; verify support before use.
- After any markup refactor that removes or replaces classes/components, grep the removed class names across all SCSS files and delete or retarget dead selectors in the same change.
