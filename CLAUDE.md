# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A **Claude Code plugin marketplace** named `dev-tools`. It is not an application — it ships
Markdown-and-`.mjs` plugins that other projects install. The two plugins:

- **`plugins/loop-stack/`** — a universal, config-driven autonomous dev-loop stack (skills, agents,
  commands, and cron loop specs).
- **`plugins/css-drift-auditor/`** — a framework-agnostic pipeline that renders components in
  Storybook, reads post-cascade computed styles, and flags CSS/design drift.

The root `.claude-plugin/marketplace.json` registers both. Each plugin has its own
`.claude-plugin/plugin.json`. **Versions live in three places that must stay in sync** for a plugin:
its `plugin.json`, its entry in the root `marketplace.json`, and any docs that cite it.

Each plugin version ships as its own GitHub release, tagged `<plugin>-v<version>`, cut locally with
`node scripts/release.mjs` (never GitHub Actions). See **`RELEASING.md`**.

## Commands

There is no build step and no install step. The test suite is `tests/`, run with Node's built-in
runner — it is what CI (`.github/workflows/validate.yml`) executes, so reproduce it locally before
committing:

```bash
node --test tests/*.test.mjs      # the whole suite (~50 tests, no dependencies)
node --test tests/onboard.test.mjs  # one file while iterating
```

What it covers: `onboard.mjs` detection + rendering + fail-soft behavior (driven as a subprocess
against throwaway fixture projects), the css-drift-auditor clustering rules and parser helpers, and
repo invariants — every tracked `.mjs` parses, every manifest is valid, plugin versions match
between `plugin.json` and `marketplace.json`, no source file carries a raw NUL byte, and every
`skills/shared/*.md` reference points at a file that exists.

**Tests are dependency-free too** (`node:test` + `node:assert` only). Scripts that need a project's
own dependencies (the React/Angular `parseFile` paths need `@babel/parser` / `parse5` resolved from
the target repo) are covered at their pure surface — predicates and helpers — not by installing
anything here. Keep it that way.

There is no E2E suite: nothing in this repo renders a UI. If that ever changes, `scaffold-test-projects`
is the harness to reach for (Gherkin + page objects + typed web-element wrappers).

`onboard.mjs` is a zero-dependency Node ES module (Node built-ins only — no `npm install`). Preview
its detection without writing anything:

```bash
node plugins/loop-stack/skills/onboard/onboard.mjs --detect-only     # print detected stack, write nothing
node plugins/loop-stack/skills/onboard/onboard.mjs --non-interactive  # write using detected values + defaults
```

## loop-stack architecture (the big picture)

The organizing principle is **"nothing is hardcoded."** Every skill/agent/command/loop is
project-agnostic; all project specifics (issue tracker, branch model, package manager, frameworks,
backend/DB, edge, tests, CI/deploy, design tool) live in a **per-project `.claude/stack.md`** (plus a
machine-readable `.claude/stack.json`) that the target project generates — they are *not* in this
repo. To understand any file here, read it alongside two references:

- **`CONVENTIONS.md`** — the token → config mapping. Every file replaces a concrete tool
  (e.g. "Jira `RESC-123`") with a `${issueTracker.*}`-style config reference. When editing skills,
  keep this contract: *use config values, never assume a specific tool; if a capability is `none`,
  skip that step — don't ask, don't invent.*
- **`MANIFEST.md`** — the loop roster (FIX / VERIFY / STORY-VERIFY / PR-REVIEW / DEPLOY-FIX /
  PR-SHEPHERD / SYNC-INTEGRATION / E2E-SWEEP / DAILY-REPORT), their cron cadences, and the layout.

Key flows:

- **`skills/onboard/onboard.mjs`** is the linchpin: it detects the stack, then writes `stack.md` /
  `stack.json`, drops `CLAUDE.template.md` as the project's root `CLAUDE.md`, and materializes
  `loops/*.md` into the target's `.claude/loops/`. It is **tracker-adaptive** — Jira, GitHub Issues,
  and Linear are co-equal first-class paths (see the `TRACKER` presets in the script and the
  tracker-adaptive table in `CONVENTIONS.md`). A "team" = one repo = one `stack.md`.
- **`launch-loop-stack` / `stop-loop-stack`** skills register/tear down the session crons.
- Path split for coding work: **`devfix`** handles bug/ticket fixes; **`implement`** (command) handles
  non-bug feature work; **`implement-designs`** must audit *every* design node and read *whole*
  Confluence pages (no subsets/excerpts).
- **Superpowers integration is optional and soft.** If the `superpowers` plugin is installed,
  `onboard` records `integrations.superpowers: yes` and shared disciplines (TDD, systematic debugging,
  verification, code review, parallel-agent dispatch, finishing-a-branch) delegate to it; absent, each
  touchpoint falls back to a built-in checkpoint. The single source of truth for this delegation is
  **`skills/shared/superpowers-integration.md`** — reference it, never restate the mapping elsewhere.
- **Loop state is per-project**, written to the target's gitignored `.claude/loops/state/`, never
  `/tmp` or any shared path (issue keys / PR numbers are only unique within a repo).

## css-drift-auditor architecture

A staged `.mjs` pipeline under `plugins/css-drift-auditor/scripts/` driven by
`config/audit.config.json`: `detect-framework` → `project-map` / `element-map` (parse React `.tsx/.jsx`
and Angular `*.component.ts` into a mixed html+component tree, catching raw tags with ad-hoc
`className`/inline styles/arbitrary Tailwind) → `generate-stories` → `extract-computed-styles` (render
in Storybook, read **post-cascade computed** values) → `analyze-drift` (cluster into a token scale,
flag low-usage outliers). The `drift-fix-agent` applies approved token replacements, scoped per
property domain (color / spacing / typography).

## Conventions when editing

- Skills/agents/commands/loops are **Markdown instruction files**, not code. Edit them as prose
  contracts. Keep the config-first contract at the top of each file.
- Prefer the dedicated generic skill over a tool-specific one (`database-migration` over
  `supabase-migration`, `memory-first` over `memory-qdrant-first`, `test-management-sync` over
  `zephyr-e2e-sync`); the tool-named variants are legacy pointers.
- `onboard.mjs` stays **dependency-free** (Node built-ins only) and **fail-soft** (detection wrapped so
  a missing CLI never crashes the run). Preserve both properties — `tests/onboard.test.mjs` asserts
  both, including a run with `PATH` emptied.
- After changing any `.mjs` or manifest, run `node --test tests/*.test.mjs`. That is exactly what CI
  gates on, and it subsumes the old `node --check` + JSON-parse checks.
- Never embed a raw control character in a source file — write the escape sequence. A literal NUL
  makes the file binary to `grep`/`ripgrep`, which silently hides its contents from every search in a
  repo whose workflow is searching skill and script files. `tests/manifests.test.mjs` enforces this.

## Note on this repo's own context

This is a healthcare-adjacent working environment (PixelCare Health): in any examples, code, or tests,
use only synthetic or fully anonymized data — never real patient PHI.
