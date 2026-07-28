---
name: css-drift-audit
description: >
  Systematically audit and normalize CSS/design drift across any frontend
  codebase using Storybook-rendered computed styles. Use when the user wants to
  find inconsistent colors, spacing, typography, or radii; make a design system
  consistent; extract design tokens from existing components; or run a "design
  drift", "CSS audit", or "style consistency" pass. Framework-agnostic — works on
  React, Vue, Svelte, and Angular through Storybook.
---

# CSS drift audit

Audit design-value drift by rendering every component in Storybook and reading
post-cascade computed styles — the ground-truth pixel values after Tailwind,
theme providers, CSS variables, and inheritance resolve. Source-level regex
misses these; computed styles do not. Storybook is the universal surface, so the
same pipeline works for any framework it renders.

All scripts live in `${CLAUDE_PLUGIN_ROOT}/scripts` and run with bare `node`
(no project TypeScript required). Run them from the target project root. Drive
the phases in order and stop at each CHECKPOINT for user review.

## Phase 0 — Detect environment
Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/detect-framework.mjs --write`.
It writes `design-audit/framework.json` (framework, Storybook preset, component
dirs, package manager). Read it before continuing.

## Phase 1 — Map the surface + Storybook coverage
1. Copy `${CLAUDE_PLUGIN_ROOT}/config/audit.config.json` to
   `design-audit/audit.config.json` if absent; let the user tune thresholds.
2. Map the actual element surface — pages are a mix of components AND raw HTML
   tags, and raw tags are where drift hides:
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/element-map.mjs`. It auto-dispatches by
   framework via pluggable parsers in `scripts/parsers/` (React `.tsx`/`.jsx`
   and Angular `*.component.ts` ship today; Vue/Svelte are drop-in additions).
   Deps are resolved from the target project: React needs `@babel/parser`,
   Angular needs `@babel/parser` + `parse5`
   (`npm i -D @babel/parser parse5`). Writes `element-map.json` with a per-file
   html+component tree and a `styledHtmlTags` list — raw HTML elements carrying
   className/inline-style/Tailwind-arbitrary values. This is the source-level
   drift surface.
3. If `framework.json.hasStorybook` is false, tell the user Storybook is
   required and offer `npx storybook@latest init`. Do not install without
   confirmation.
4. Catalog components and find coverage gaps:
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/project-map.mjs` then
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/generate-stories.mjs` (dry run).
   Review the list with the user, then re-run with `--write`. Auto-generated
   stories carry a header marker and may fail to render if the component needs
   required props — that is expected; refine those few by hand.

## Phase 2 — Extract computed styles (the core)
1. Start Storybook: `npm run storybook` (background), or build static with
   `npm run build-storybook` and pass `--static storybook-static`.
2. Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/extract-computed-styles.mjs`
   (needs Playwright: `npm i -D playwright && npx playwright install chromium`).
3. Output: `design-audit/computed-tokens.json` — every distinct computed value
   per property, with usage counts and owning components. Stories that throw
   during render (detected via page errors and known Storybook error-UI
   markers) are excluded rather than scraped, and counted separately in
   `skippedErrors` — a high count there usually means several components need
   required-prop refinement in their generated story (Phase 1.4).

CHECKPOINT: surface the per-property distinct-value counts, plus `skipped` /
`skippedErrors`, before analysis. A high `skippedErrors` count means the
drift report is running on a smaller sample than intended — worth fixing the
underlying stories before trusting the results.

## Phase 3 — Analyze drift
Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/analyze-drift.mjs`. Outputs
`design-audit/drift-report.md` (clusters, canonical per cluster, drift
outliers flagged) and `design-audit/suggested-tokens.json`
(drift value → canonical → token name). Text/background/border colors are
clustered as separate groups (they're different design roles even when
RGB-close). A member is flagged as drift when it's within tolerance of its
cluster's canonical value and either used rarely in absolute terms
(`driftMaxUsage`) or rarely *relative to the canonical* (`driftMaxUsageRatio`,
default 15%) — the relative check is what catches systemic drift (a stale
value used dozens of times, not just once or twice), which an absolute
threshold alone misses.

There are two complementary drift surfaces — cross-reference both: the runtime
surface (`computed-tokens.json`, what the cascade actually produced) and the
source surface (`element-map.json` → `styledHtmlTags` / `arbitrary`, the raw
HTML tags and Tailwind arbitrary values authored directly). A value flagged in
both is high-confidence drift; a raw tag with an arbitrary value is a prime
candidate to either tokenize or lift into a component.

CHECKPOINT: the user reviews drift-report.md and marks any intentional one-offs
as `"intentional": true` in suggested-tokens.json. Never modify intentional
values.

## Phase 4 — Fix (parallel, scoped)
For each domain (color, spacing, typography), spawn the `drift-fix-agent`
scoped to ONE property family. Each agent replaces only its domain's drift
values with the approved token, never touches component logic or other domains,
and commits per domain. Never auto-merge — each commit needs review.

## Phase 5 — Verify
1. Re-run extract-computed-styles → confirm flagged drift values are gone.
2. Run Storybook's test-runner or a Playwright screenshot diff per story to
   catch visual regressions — per-component, not whole-page.
Report a short coverage + regression summary.

## Guardrails
- Cluster on browser-normalized computed values, never on raw source strings.
- One domain per fix agent. Commit per domain. No auto-merge.
- Values marked `"intentional": true` are immutable.
- Confirm before installing Storybook or Playwright into the user's project.
