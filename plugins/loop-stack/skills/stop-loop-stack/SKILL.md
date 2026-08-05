---
name: stop-loop-stack
description: Tear down the autonomous "my work in the active iteration" loop stack for the current session — delete the FIX, IMPLEMENT, VERIFY, STORY-VERIFY, PR-REVIEW, DEPLOY-FIX, PR-SHEPHERD, E2E-SWEEP, DAILY-REPORT, and SYNC-INTEGRATION recurring crons in one shot so no further ticks fire. Use when the user says "stop the loops", "bring the loop stack down", "tear down / halt / kill / pause the loops", "stop the my-work loops", or "disable the autonomous loops". The inverse of `launch-loop-stack`. Stops scheduling only — never touches code, branches, or in-flight issue-tracker/PR state.
---

# Stop Loop Stack

> **Config-driven — read `.claude/stack.md` first; use its values; never assume a specific tool.** This
> skill only deletes session crons, so it works even when most capabilities are `none` — but if
> `.claude/stack.md` is missing, run the **`onboard`** skill and stop. If a needed capability is
> `none`, the matching loop simply was never launched, so there is nothing to delete for it.

## Purpose

Delete the session-scoped recurring crons that drive the autonomous **"my work in the active iteration"** workflow, so the loops stop firing for the rest of the session. This is the inverse of `launch-loop-stack`.

The loops it tears down (identify by the **prompt signature**, not a fixed count — the set has grown over time and may grow again):

| Loop | Prompt signature (match on this) | Spec |
|---|---|---|
| **FIX** | `— FIX TICK` (matches `Autonomous "my bugs" — FIX TICK` and any title variant) | `.claude/loops/my-bugs-in-sprint-devfix.md` |
| **IMPLEMENT** | `— IMPLEMENT TICK` (matches `Autonomous "my stories" — IMPLEMENT TICK`) | `.claude/loops/implement.md` |
| **VERIFY** | `— VERIFY TICK` but NOT `— STORY-VERIFY TICK` (matches `Autonomous "my bugs" — VERIFY TICK`) | `.claude/loops/my-bugs-in-sprint-devfix.md` |
| **STORY-VERIFY** | `— STORY-VERIFY TICK` (matches `Autonomous "my stories" — STORY-VERIFY TICK`) | `.claude/loops/my-bugs-in-sprint-devfix.md` |
| **PR-REVIEW** | `Autonomous PR-REVIEW TICK` | `.claude/loops/pr-review.md` |
| **DEPLOY-FIX** | `Autonomous DEPLOY-FIX TICK` | `.claude/loops/deploy-failure-fix.md` |
| **PR-SHEPHERD** | `Autonomous PR-SHEPHERD TICK` | `.claude/loops/pr-shepherd.md` |
| **E2E-SWEEP** | `Autonomous E2E-SWEEP TICK` | `.claude/loops/e2e-sweep.md` |
| **DAILY-REPORT** | `Autonomous DAILY-REPORT TICK` | `.claude/loops/daily-report.md` |
| **SYNC-INTEGRATION** | `Autonomous SYNC-INTEGRATION TICK` | `.claude/loops/sync-integration.md` |

## When to use

- User says: "stop the loops", "bring the loop stack down", "tear down / halt / kill / pause the loops", "stop the my-work loops", "disable the autonomous loops".
- Before a maintenance window, release freeze, or when handing the repo to a human who doesn't want background ticks.

## How to stop (do this when invoked)

1. **List first.** Call `CronList`. Read every job's ID and prompt.
2. **Match the loop crons by prompt signature** from the table above. A cron is part of the stack if its prompt **starts with / contains** one of those signatures. Do **NOT** delete crons that don't match — the user may have unrelated scheduled jobs.
3. **Delete each matched cron** with `CronDelete <id>`. One call per job.
4. **Re-list** (`CronList`) to confirm none of the signatures remain.
5. **Report**:
   - Every job ID deleted, grouped by loop name (FIX / IMPLEMENT / VERIFY / STORY-VERIFY / PR-REVIEW / DEPLOY-FIX / PR-SHEPHERD / E2E-SWEEP / DAILY-REPORT / SYNC-INTEGRATION).
   - Any stack loop that was **already absent** (nothing to delete).
   - Any **non-stack** crons left untouched (list them so the user knows they're still scheduled).
6. Do **not** delete the loop state files in `.claude/loops/state/` by default (see below).

## In-flight work — what stopping does and does NOT do

- Deleting a cron only stops **future ticks** from being scheduled. It does **not** interrupt a tick already executing in another turn, and it does **not** roll back anything a prior tick already did (a PR it merged, an issue-tracker transition it made, a branch it pushed).
- If the user wants to also abort an *in-progress* devfix or revert a branch, that's a **separate** explicit request — this skill does not touch the VCS or the issue tracker.

## State files (leave intact unless asked)

The loops keep small dedupe / park files in the project's `.claude/loops/state/` (per-project + gitignored — never global `/tmp`, which is shared across projects and wiped on reboot). **Leave them in place** so a later `launch-loop-stack` resumes cleanly without re-parking or re-reviewing:

- `.claude/loops/state/my-bugs-verify-parked.txt` — bugs VERIFY has parked (e.g. no AC coverage).
- `.claude/loops/state/my-stories-verify-parked.txt` — stories STORY-VERIFY has parked (e.g. no e2e AC coverage).
- `.claude/loops/state/my-stories-implement-parked.txt` — stories IMPLEMENT has parked (needs-decomposition, ambiguous AC, missing design).
- `.claude/loops/state/pr-review-done.txt` — `"<number>@<headRefOid>"` of PRs already reviewed.
- `.claude/loops/state/deploy-fix-done.txt` — deploy run IDs already handled.
- `.claude/loops/state/pr-shepherd-done.txt` — `"<number>@<headRefOid>"` of my PRs already shepherded (incl. `# needs-human` escalations).
- `.claude/loops/state/sync-integration-blocked.txt` — fix-base↔env branch pairs SYNC-INTEGRATION could not sync (conflict/protected).
- `.claude/loops/state/e2e-sweep-cursor.txt`, `e2e-sweep-health.json`, `e2e-sweep-report.md`, `e2e-sweep-blocked.txt` — the sweep's round-robin position, per-scenario history, rolling report, and skipped ticks. **Especially worth keeping**: deleting the health file throws away the accumulated pass/fail/flake history the report is built from.

Only clear these if the user explicitly asks for a **full reset** (e.g. "stop the loops and wipe their state"). If so, `rm -f` the files and say which were removed.

## Restarting

To bring the stack back up, invoke `launch-loop-stack` (it re-creates only the loops that are missing and reports existing job IDs).

## Related

- `launch-loop-stack` — the inverse; creates the loop crons.
- `.claude/loops/my-bugs-in-sprint-devfix.md` — full FIX + VERIFY spec.
- `.claude/loops/implement.md` — full IMPLEMENT spec.
- `.claude/loops/pr-review.md` — full PR-REVIEW spec.
- `.claude/loops/deploy-failure-fix.md` — full DEPLOY-FIX spec.
- `.claude/loops/pr-shepherd.md` — full PR-SHEPHERD spec.
- `.claude/loops/e2e-sweep.md` — full E2E-SWEEP spec.
- `.claude/loops/daily-report.md` — full DAILY-REPORT spec.
