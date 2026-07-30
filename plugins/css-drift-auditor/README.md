# css-drift-auditor

Universal, framework-agnostic CSS/design-drift audit pipeline for Claude Code.
It renders every component in Storybook and reads **post-cascade computed
styles** — the real pixel values after Tailwind, theme providers, CSS variables,
and inheritance resolve — then clusters them into a token scale and flags
low-usage outliers as drift. No Figma required. No design source of truth needed;
the codebase *is* the source.

Works on any framework Storybook renders: React, Next.js, Vue, Svelte, Angular.

## Why computed styles

Source-level scanners see `className="text-sm"` and stop. They cannot resolve
what `text-sm` actually is, what the theme injected, or what cascaded in. The
browser already normalizes everything (`#2e2e2e`, `rgb(46,46,46)`, and a theme
var all become `rgb(46, 46, 46)`), so dedup and drift detection are exact.

## Parsers

`element-map.mjs` is an orchestrator that dispatches each file to a framework parser in `scripts/parsers/`, all returning one shared node shape (`{ type: "html" | "component" | "fragment", name, className, inlineStyle, arbitrary, loc, children }`):

| Parser | Files | Engine | Project deps |
|---|---|---|---|
| `parsers/react.mjs` | `.tsx` / `.jsx` | `@babel/parser` (JSX AST) | `@babel/parser` |
| `parsers/angular.mjs` | `*.component.ts` | `@babel/parser` (read `@Component`) + `parse5` (template HTML) | `@babel/parser`, `parse5` |

The Angular parser reads the `@Component` decorator (selector, inline `template` or external `templateUrl`, `styleUrls`), parses the template with parse5 — the HTML5 spec parser, so Angular's `[binding]`, `(event)`, and `*structural` attributes survive — and classifies elements: native tags → html, discovered component selectors and hyphenated custom elements (`app-*`, `mat-*`) → component, `<ng-container>`/`<ng-template>` → fragment. Class/style bindings (`class`, `[ngClass]`, `[class.x]`, `style`, `[style.x]`, `[ngStyle]`) are all folded into `className`/`inlineStyle`, and Tailwind arbitrary values are extracted even out of `[ngClass]` object literals.

Adding Vue or Svelte is a new file in `parsers/` registered in `element-map.mjs`'s `PARSERS` array — no other change.

## Two drift surfaces

Drift lives in two places, and the plugin captures both. `element-map.mjs` parses every JSX file into a tree that keeps the distinction between components and raw HTML tags — because pages are a mix of the two, and raw `<div>`/`<button>`/`<h1>` tags carrying ad-hoc `className`, inline styles, or Tailwind arbitrary values (`bg-[#2e3440]`) are the **source-level** drift surface (`styledHtmlTags`). `extract-computed-styles.mjs` reads the **runtime** surface — the resolved pixel values after the cascade. A value flagged in both is high-confidence drift; a raw tag with an arbitrary value is a prime candidate to tokenize or lift into a component.

## Install

Unzip into your Claude Code plugins directory, or install the `.plugin` file
directly. Then in any project, ask Claude to "run a CSS drift audit" — the
`css-drift-audit` skill orchestrates the phases.

Per-project prerequisites (Claude will prompt before installing):
- Storybook (`npx storybook@latest init`)
- Playwright (`npm i -D playwright && npx playwright install chromium`)

## Scripts (run from project root with bare `node`)

| Script | Purpose | Output |
|---|---|---|
| `detect-framework.mjs --write` | framework + Storybook preset | `design-audit/framework.json` |
| `project-map.mjs` | component catalog + coverage + routes | `design-audit/project-map.json` |
| `element-map.mjs --trees` | mixed html+component tree (React + Angular), flags styled raw tags | `design-audit/element-map.json` |
| `generate-stories.mjs --write` | scaffold stories for uncovered components | `*.stories.*` |
| `extract-computed-styles.mjs` | **render + read computed styles** | `design-audit/computed-tokens.json` |
| `analyze-drift.mjs` | cluster + flag outliers | `design-audit/drift-report.md`, `suggested-tokens.json` |

## Workflow

`detect → ensure Storybook coverage → extract computed styles → analyze drift →
fix (parallel, scoped agents) → verify (per-story visual diff)`.

Each fix agent is scoped to one domain (color / spacing / typography), commits
per domain, and never auto-merges. Values marked `"intentional": true` in
`suggested-tokens.json` are never touched.

## Config

`config/audit.config.json` (copied to `design-audit/audit.config.json` on first
run): which properties to extract, values to ignore, clustering tolerances
(`colorDistance`, `colorAlphaTolerance`, `spacingTolerancePx`,
`fontSizeTolerancePx`, `driftMaxUsage`, `driftMaxUsageRatio`).
