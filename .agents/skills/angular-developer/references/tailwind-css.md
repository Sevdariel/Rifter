# Using Tailwind CSS with Angular

Tailwind CSS is a utility-first CSS framework that integrates seamlessly with Angular.

## Version-Aware Guidance

Verify the installed Tailwind version in the project's package manifest and lockfile before changing configuration. Angular's version does not determine Tailwind's version.

This repository uses Tailwind CSS 3. Preserve its existing `tailwind.config.js`, `@tailwind` directives, and `tailwindcss-primeui` integration. Do not install Tailwind 4 packages or replace the existing styling pipeline as part of ordinary feature work.

The existing Tailwind 3 global styles use:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

## Explicitly Requested Tailwind 4 Setup or Migration

The following examples apply only to an explicitly requested Tailwind 4 setup or migration. Verify Angular CLI support, dependency compatibility, and PrimeNG styling integration before applying them; they are not instructions to migrate this repository by default.

### Automated Setup

For an approved setup with a compatible Angular CLI, Tailwind can be added with:

```shell
ng add tailwindcss
```

Review the generated dependencies, configuration, and global styles for the requested version.

### Manual Setup (Tailwind 4)

#### 1. Install Dependencies

For the approved Tailwind 4 setup, install Tailwind CSS and PostCSS:

```shell
npm install tailwindcss@4 @tailwindcss/postcss@4 postcss
```

#### 2. Configure PostCSS

Configure `.postcssrc.json` in the project root, preserving any other required plugins:

```json
{
  "plugins": {
    "@tailwindcss/postcss": {}
  }
}
```

Tailwind 4 favors CSS-first configuration. An approved migration must account for existing theme settings and plugins before replacing a Tailwind 3 configuration.

#### 3. Import Tailwind CSS

For Tailwind 4, use a global CSS entry point (e.g., `src/styles.css`):

```css
@import 'tailwindcss';
```

Tailwind 4 is not designed for Sass preprocessing; review the style entry points as part of an approved migration rather than substituting an SCSS `@use` statement.

## Use Utility Classes

Use utility classes supported by the installed Tailwind version in component templates:

```html
<h1 class="text-3xl font-bold underline">Hello world!</h1>
```

## Summary for AI Agents

- For this repository's Tailwind 3 setup, preserve `tailwind.config.js`, `@tailwind` directives, and `tailwindcss-primeui`.
- For an explicitly requested Tailwind 4 setup or migration, use compatible PostCSS integration and CSS imports, adapting existing configuration and plugins deliberately.
- Follow installed versions and repository scope rules; do not upgrade dependencies or migrate tooling without approval.
