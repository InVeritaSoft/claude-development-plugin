---
name: gherkin-run-and-assure
description: Run all related API, E2E, and unit tests for the Gherkin fix; verify every related test and scenario passes; assure the user explicitly. Do not consider the command complete until all are green. Use after gherkin-implement-and-store.
---

# Gherkin Run and Assure

## Purpose

Run every test and scenario related to the fix, fix any failures, and **assure the user** that all related tests and scenarios pass. The Gherkin fix command is not complete until this is done.

> **Read `.claude/stack.md` first; use its values; never assume a specific tool.** If a needed capability is `none`, skip those steps. If the config is missing, run the `onboard` skill and stop.

Use the configured runners and locations: the E2E runner/dir/BDD step in `${testing.e2e.*}` (e.g. Playwright + `npx bddgen`), the unit runner/locations in `${testing.unit.*}`, and the package manager/scripts in `${commands.*}`. A test type whose runner is `none` is reported with the `scaffold-test-projects` offer, not silently skipped — see `.claude/skills/shared/green-gate.md`.

## When to Use

- After **gherkin-implement-and-store** in the Gherkin fix command (steps 4–5).
- Before reporting completion to the user.

## Run All Related Tests (Required)

1. **API / integration tests (single feature)** — From the API-tests directory, regenerate BDD specs then run the one affected spec:
   ```bash
   ${testing.e2e.bddStep} && <e2e run command> <generated spec for the changed feature>
   # (e.g. pnpm bddgen && pnpm exec playwright test .features-gen/.../<name>.feature.spec.js --project=bdd)
   ```
2. **UI / E2E tests (single feature)** — From `${testing.e2e.dir}`:
   ```bash
   cd ${testing.e2e.dir}
   ${testing.e2e.bddStep} && <e2e run command> <feature file> --reporter=list
   # (e.g. npx bddgen && npx playwright test e2e/features/<name>.feature --reporter=list)
   ```
   Prefer one feature (or one tier) at a time; use **e2e-narrow-fail-focus-success** for tiers and commands.
3. **Unit tests for touched code** — Run the corresponding unit tests (`${testing.unit.runner}`) for edited components/modules at `${testing.unit.locations}`.

Optionally gather code metrics for the changed area if the project's knowledge store (`${memory.store}`) exposes such a capability.

## Verify and Assure

- **MUST**: Confirm that **all** targeted feature(s), scenarios, and related unit tests **pass**.
- If any test or scenario fails: fix the cause and re-run the **same** tests until they pass.
- **Do not stop** until every related feature spec, scenario, and unit test is green.
- **Then run the green gate** — `.claude/skills/shared/green-gate.md`: the **full** unit suite and
  the **full** E2E suite, not just the features you touched. Assuring the user on a one-feature run
  is exactly how a sibling scenario ships red.
- **Report clearly to the user** that all unit tests and all E2E scenarios pass, with the verbatim
  commands and counts. If a suite doesn't exist, say so and offer `scaffold-test-projects` (Gherkin
  + page objects + typed web-element wrappers + hooks) instead of quietly assuring on a partial run.

## Subagent Option

To run test commands in isolation (e.g. long-running E2E), spawn a shell-capable subagent with a prompt that specifies the exact command and working directory; then interpret the output and continue verification.

## Related Skills

- `e2e-narrow-fail-focus-success` — E2E tiers and one-feature-at-a-time strategy.
- `run-tests` — test-suite selection and execution patterns.
- `double-check-code` — build/lint/test verification after changes.
- `generate-tests-after-implementation` — add missing coverage before assurance run.
- `test-endpoint` — smoke-test a specific endpoint the scenario depends on.
- `gherkin-implement-and-store` — runs before this.
- `devfix` — Phase 3 of devfix calls this skill when a Gherkin scenario was implemented.
