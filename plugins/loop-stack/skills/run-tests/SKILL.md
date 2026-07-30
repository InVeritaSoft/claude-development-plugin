---
name: run-tests
description: Picks and runs the right test suite (backend/unit, API/integration, frontend unit, E2E, workspace) based on the files changed or the user's ask, with correct flags (watch/coverage/targeted file). Use when the user says "run tests", "run the tests for X", "check coverage", or when you've just edited code and need a targeted verification run. Do NOT use for fixing failing E2E tests (use `e2e-narrow-fail-focus-success`) or for post-implementation quality review (use `double-check-code`).
---

# Run Tests

## Purpose

Runs appropriate test suites based on code changes and user requests.

> **Read `.claude/stack.md` first; use its values; never assume a specific tool.** If a needed capability is `none`, skip those steps. If the config is missing, run the `onboard` skill and stop.

All runners, commands, and locations come from config: the package manager + scripts in `${commands.*}`, the unit runner/locations in `${testing.unit.*}` (e.g. Vitest, Jest), the E2E runner/dir in `${testing.e2e.*}` (e.g. Playwright), and the project layout (`${backend.*}`, `${edge.*}`, `${frontend.apps}`). If a given test type is `none`, there is nothing to run — say so and offer `scaffold-test-projects`; don't skip it silently (see the closing green gate below).

## When to Use

Use this skill when:
- User asks to run tests
- After making code changes
- Verifying test coverage
- Debugging test failures
- Running specific test suites

## Test Suite Detection

### 1. Determine Test Type
Map changed files (or the user's request) to a suite, using the project's own layout from config:
- **Backend / server code** (under the backend source dir) → backend unit + API/integration tests
- **Frontend code** (under a `${frontend.apps}` package) → that app's unit/component tests + E2E if behavior changed
- **Shared core/package** (a workspace package) → that package's unit tests
- **Serverless / edge code** (under `${edge.*}` functions dir) → API/integration tests for those functions

### 2. Select Test Suite
- **API / integration tests**: the project's API-test location (integration tests for backend/edge endpoints)
- **UI / component + E2E tests**: `${testing.e2e.dir}` and the frontend unit locations
- **Unit tests**: per-package unit tests at `${testing.unit.locations}`
- **Feature / BDD tests**: `.feature` files run via `${testing.e2e.bddStep}` (when the project uses BDD)

### 3. Choose Options
- **Watch Mode**: For development (e.g. `--watch`)
- **Coverage**: Generate coverage reports (e.g. `--coverage`)
- **Specific Files**: Run specific test files
- **Pattern**: Run tests matching a pattern (e.g. `--grep`)

## Running Tests

Use the package manager and scripts from `${commands.*}` (e.g. pnpm/npm/yarn) and the runner from `${testing.unit.runner}`. Substitute the project's real script names; the shapes below are templates.

### Backend / API tests
```bash
# From the backend (or API-tests) directory
${commands.test}                 # run the suite
${commands.test} --watch         # watch mode (if supported)
${commands.test} <path/to/test>  # a single test file
```

### Frontend tests
```bash
# From the relevant ${frontend.apps} package (or the UI-tests dir)
${commands.test}
${commands.test} --watch
${commands.test} <ComponentName test file>
```

### Unit tests (a specific package)
```bash
# Filter to one workspace package (e.g. pnpm --filter <pkg>, npm -w <pkg>)
${commands.packageManager} <filter flag> <package> ${commands.test}
# Or the project's dedicated unit-test script:
${commands.test} <unit script, if defined>
```

## Test Execution Strategy

### After Code Changes
1. Identify changed files
2. Determine affected test suites (per the detection map above)
3. Run relevant tests
4. Verify all tests pass

### Debugging Failures
1. Run failing test in isolation
2. Use watch mode for iterative debugging
3. Check test output and error messages
4. Verify test data and setup

### Coverage Reports
1. Run tests with the coverage flag
2. Review coverage reports
3. Identify untested code paths
4. Add tests for uncovered areas

## Common Commands

```bash
# Full test suite
${commands.test}

# Watch mode
${commands.test} --watch

# Coverage
${commands.test} --coverage

# Specific pattern
${commands.test} --grep "pattern"

# Single file
${commands.test} <path/to/test>

# Update snapshots
${commands.test} -u
```

## Test Verification

After running tests:
- All tests pass
- No test regressions
- Coverage meets requirements
- Test output is clear
- Failures are properly reported

## Closing green gate (after an implementation)

The targeted runs above are the iteration loop. When the change is finished, the gate is the **full**
unit suite plus the **full** E2E suite, both green, with the verbatim command and raw output — read
`.claude/skills/shared/green-gate.md` and execute it. Two things it changes about the defaults here:

- **No narrowing at the gate.** `--filter`, a path argument, or `--grep` on the issue tag is fine
  while iterating; the closing run has none of them.
- **A missing suite is surfaced, not skipped.** If `${testing.unit.runner}` or
  `${testing.e2e.runner}` is `none` (or the dir holds no tests), offer to build it with
  `scaffold-test-projects` — Gherkin `.feature` files, page objects, typed web-element wrappers,
  hooks — and record the outcome as `suggested-scaffold`. This is the one place the config
  contract's "skip when none" does not apply.

## Related skills

- `shared/green-gate.md` — the closing full-suite gate (all units + all E2E green, or offer the scaffold).
- `scaffold-test-projects` — build the suite when there isn't one (page objects + typed web elements + hooks).
- `double-check-code` — end-to-end quality gate (build + lint + test + review); composes this skill.
- `e2e-narrow-fail-focus-success` — use this when E2E tests are failing; do **not** try to triage E2E here.
- `generate-tests-after-implementation` — add tests after a feature/bug before running here.
- `test-endpoint` — smoke-test a specific endpoint instead of running suites.
- `gherkin-run-and-assure` — run and assure the Gherkin sub-flow of `devfix`.
- `devfix` — Phase 3 of the devfix flow calls into this skill.
