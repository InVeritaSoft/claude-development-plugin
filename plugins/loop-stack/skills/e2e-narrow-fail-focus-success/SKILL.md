---
name: e2e-narrow-fail-focus-success
description: Gets E2E tests green quickly by running one feature at a time, lowest tier first, adding services only as you move up. Use when fixing E2E, covering frontend with E2E, or when the user has limited time for E2E.
---

# E2E Narrow Fail, Focus Success

## Purpose

Get the project's E2E suite passing with minimal services and clear failure scope. Run **one feature at a time**; add services only when moving to the next tier.

> **Read `.claude/stack.md` first; use its values; never assume a specific tool.** If a needed capability is `none`, skip those steps. If the config is missing, run the `onboard` skill and stop.

Use the configured E2E runner `${testing.e2e.runner}` (e.g. Playwright, Cypress), its directory `${testing.e2e.dir}`, its BDD/generation step `${testing.e2e.bddStep}` (e.g. `npx bddgen`, for playwright-bdd Gherkin `.feature` files), and the package manager / scripts in `${commands.*}`. If `${testing.e2e.runner}` is `none`, there is no suite to narrow — report that and offer `scaffold-test-projects` (Gherkin + page objects + typed web-element wrappers + hooks) rather than stopping silently.

> **Tier work ends at the full suite.** Narrowing is the debugging strategy, not the finish line: once the top tier is green, run the whole suite with no `--grep` and confirm it green — that is what `shared/green-gate.md` requires before any implementation is called done.

## When to Use

- User wants E2E "up and working" quickly (e.g. one night).
- Debugging E2E failures (narrow to a single feature).
- Adding or fixing frontend E2E coverage.

## Feature Tiers (build from this project's apps + services)

Order the project's E2E features into tiers by how many services each needs, lightest first, so a failure points at the smallest possible cause. Derive the tiers from `${frontend.apps}`, `${backend.platform}`, and `${edge.platform}` rather than a fixed list. The general shape:

| Tier | Feature(s) | Services required |
|------|------------|-------------------|
| 1 | public/unauthenticated feature of one app | that app only |
| 2 | login + authenticated feature of that app | app + edge/backend (and database if auth needs it) |
| 3 | a cross-service flow (e.g. activation needing a seeded record + mail catcher) | the relevant app + edge + seed data + any mail/test service |
| 4 | another app's primary flow | that app + edge/backend |

List the actual `.feature` files discovered under `${testing.e2e.dir}` and slot them into the tiers; add services as each tier requires.

## Commands

Run from `${testing.e2e.dir}`, regenerating BDD specs first when the runner is BDD-driven:

```bash
# From the E2E directory
cd ${testing.e2e.dir}

# Run ONE feature (lowest tier first). Generate specs, then run that single feature.
${testing.e2e.bddStep} && <e2e run command> <one feature file> --reporter=list
# (e.g. Playwright: npx bddgen && npx playwright test <tier-1 feature>.feature --reporter=list)

# Move up a tier only after the current one is green — same command, next feature file.

# Run a grouped subset (if a project script exists for it), e.g. one app's features:
${commands.packageManager} <e2e:subset script, if defined in package scripts>

# Run the whole E2E suite (only once lower tiers pass):
${commands.test} <e2e suite script, e.g. test:e2e>
```

## Strategy

1. **Narrow fails**: Never run the full E2E suite until at least Tier 1 (and ideally Tier 2) is green.
2. **Use step failure messages**: well-written setup steps (e.g. "Given the app and edge functions are running", and similar service checks in the E2E support helpers) fail with clear text when a service is down. Read that first.
3. **Env**: Ensure the E2E env file under `${testing.e2e.dir}` (or the loaded env) has the correct app/service URLs (e.g. app URL, edge/backend URL, mail-catcher URL) so failures are about services, not URLs.
4. **Focus success**: Get one feature green, then add the next tier.

## Config Reference

- E2E suite: `${testing.e2e.dir}` (features, steps, pages, support — exact layout per the runner `${testing.e2e.runner}`).
- Runner config: the runner's config file under `${testing.e2e.dir}` (browser/project options).
- Env loader: the project's E2E env loader under `${testing.e2e.dir}` (loads the local E2E env file).

## Related Skills

- `shared/green-gate.md` — the closing all-green gate; this skill is its triage path when E2E is red.
- `scaffold-test-projects` — build the suite when `${testing.e2e.runner}` is `none`.
- `run-tests` — broader test-suite selector; delegates here when E2E is red.
- `memory-first` — memory/knowledge-store load before changing E2E (recall past E2E decisions).
- `gherkin-run-and-assure` — final assurance step of the Gherkin sub-flow; runs here tier-by-tier.
- `gherkin-implement-and-store` — E2E file changes often originate upstream here.
- `devfix` — Phase 3 of the devfix loop uses this skill when E2E behavior changed.
- `double-check-code` — full post-change gate; escalates to this skill when E2E is failing.
