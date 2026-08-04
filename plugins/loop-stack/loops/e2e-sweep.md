# Loop: e2e sweep → a small batch of scenarios per tick, one rolling suite-health report

A session-scoped cron that fires every 20 minutes, runs a **small, time-boxed batch** of e2e scenarios
picked round-robin off a cursor, and folds the results into **one rolling suite-health report**. Over a
working day the whole suite gets covered a few scenarios at a time — without ever paying for a full
suite run, and without competing with the foreground work for the machine. **Test-execution + report
only: this loop never edits code, tests, PRs, branches, or tracker state.** You own this file — edit
it, then re-register.

> **Config-driven.** Read `.claude/stack.md` first. Runner/dir/bdd step from `${testing.e2e.*}`.
> If `${testing.e2e.runner}` is `none`, this loop does not apply — don't register it. If
> `.claude/stack.md` is missing, run `onboard` and stop.

## Schedule

| Setting | Value |
|---|---|
| Cadence | every 20 min (`11,31,51 * * * *` — the minute-1 lane, the only one free across the stack's staggered crons) |
| Persistence | **session-only** (`durable: false`) — dies when the session exits |
| Auto-expiry | recurring cron auto-expires after **7 days** |

## Knobs (edit here, then re-register)

| Knob | Default | Meaning |
|---|---|---|
| Time budget | **5 min** | Scenarios are added to the batch while their known median duration fits this budget; the run is hard-killed at it. |
| Minimum batch | **1 scenario** | Always run at least one, even if its median exceeds the budget (it then owns the tick). |
| Failure retry | **1 re-run** | A failing scenario is immediately re-run once to separate flake from regression. |
| Base URL | auto | `${testing.e2e.baseUrl}` when the config has it; otherwise the `baseURL` / `webServer.url` in the runner's own config file. |

## State files (all under `.claude/loops/state/`)

| File | Role |
|---|---|
| `e2e-sweep-cursor.txt` | round-robin position — the scenario ids already run this pass |
| `e2e-sweep-health.json` | source of truth: one record per scenario (see below) |
| `e2e-sweep-report.md` | **the deliverable** — human-readable rolling report, regenerated each tick |
| `e2e-sweep-blocked.txt` | ticks skipped for env/harness reasons (DAILY-REPORT surfaces these) |

A scenario **id** is `<feature-or-spec path>::<scenario name>` — stable across runs, and the thing the
cursor, the health records, and the report all key on.

## What each tick does

1. **Env probe — never start or stop anything.** Resolve the base URL (knob above) and probe it
   (`curl -sS -o /dev/null -w '%{http_code}' --max-time 3 <url>`). Unreachable → append
   `<ISO timestamp> # env down: <url>` to `.claude/loops/state/e2e-sweep-blocked.txt` and **STOP**.
   This loop reuses whatever is already running; it must never race the foreground work by bringing a
   dev server or container stack up or down.
2. **Overlap guard.** `git status --porcelain` over source/test dirs shows any change other than
   `.claude/scheduled_tasks.lock` → **STOP** (a FIX/VERIFY tick may be mid-work; a dirty tree also makes
   the results un-attributable).
3. **Inventory the suite.** Prefer the runner's own listing (e.g. `${testing.e2e.bddStep}` then
   `npx playwright test --list --reporter=json` for playwright+bdd); if the runner can't list, parse
   `Scenario:` / `Scenario Outline:` names out of the feature/spec files under `${testing.e2e.dir}`.
   Ids that vanished from the inventory are dropped from the health file (renamed/deleted scenarios must
   not rot the report).
4. **Select the batch — round-robin, time-boxed.** Order candidates: never-run first, then
   least-recently-run. Add scenarios while the sum of their stored median durations is under the time
   budget (unknown duration counts as 60s); always take at least one. When every id is in the cursor
   file, the pass is complete — clear it and start the next pass.
5. **Run just that batch**, filtered by scenario title through the runner's grep/filter
   (e.g. `npx playwright test --grep "<escaped title>"`), with a hard timeout at the budget. Killed by
   the timeout → record those scenarios as `timeout`, not as failures.
6. **Triage each failure — flake vs regression.** Re-run the failing scenario once on its own (budget
   permitting; if not, defer to the next tick). Passes on the re-run → `flake`. Fails again →
   `confirmed`. Recognize the env/infra signatures in `${recoveryNotes}`: those are **never** recorded as
   failures — record the tick in the blocked file instead and stop.
7. **Update `e2e-sweep-health.json`.** Per scenario: `id`, `lastRun` (ISO), `status`
   (`pass` / `confirmed` / `flake` / `timeout`), `durationMs` + rolling median, `errorSignature`
   (first assertion/error line, normalized — no timestamps, ids, or paths that change per run),
   `consecutiveFails`, `flipCount`, `lastGreen`, `runs`.
8. **Regenerate `e2e-sweep-report.md`** from the health file — never appended to by hand, always a
   rebuild, so it is always current:
   - **Coverage** — scenarios run in the last 24h / total, current pass position, and the 5 stalest
     scenarios (longest since any run).
   - **Confirmed regressions** — each with its error signature, when it was last green, and how many
     consecutive ticks it has failed. Sorted worst-first.
   - **Flakes** — scenarios by `flipCount`, i.e. the ones that pass on retry. This is the list that
     usually explains a red CI run.
   - **Slowest** — top scenarios by median duration, with the share of the budget they eat.
   - **Last tick** — what ran, how long it took, what the batch cost against the budget.
9. **Notify only on a flip.** A scenario that went `pass` → `confirmed` since its previous record →
   one `PushNotification`: `"e2e: <scenario> regressed (last green <when>)"`, collapsed to a count when
   several flip in one tick. Everything else — greens, known-still-failing, flakes, stale coverage — is
   silent and lives in the report. **A quiet tick means nothing new broke.**

**Runs tests and writes its own state only. Never edits code or tests, never touches PRs, branches, or
the tracker. Session-only.**

## Start / Stop / Adjust

- **Stop:** `stop-loop-stack`, or `CronDelete <id>` (`CronList` for ids), or close the session.
- **Re-register** (after editing this file / new session): re-run `launch-loop-stack`.
- **Cover the suite faster:** raise the time budget, or move the cadence to the `1,11,21,…` lane
  (every 10 min). Both raise the machine load this loop puts behind your foreground work.
- **Start a clean pass:** delete `e2e-sweep-cursor.txt`. **Reset all history:** delete
  `e2e-sweep-health.json` too (the report rebuilds from empty).
- **Survive restarts:** register with `durable: true`.

## Related

- `.claude/loops/daily-report.md` — surfaces this loop's blocked lines and a one-line health headline.
- `e2e-narrow-fail-focus-success` — the skill to run **by hand** against what this report flags red;
  this loop deliberately never fixes anything itself.
- `scaffold-test-projects` — bootstraps the e2e project this loop sweeps.
