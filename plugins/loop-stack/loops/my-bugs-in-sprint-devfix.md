# Loop: "My Bugs / My Stories" → auto-fix + auto-verify

Session-scoped cron loops over the current user's assigned work (BUGS for FIX/VERIFY, STORIES for STORY-VERIFY).
You own this file — edit it, then re-register the jobs (see *Start / Stop*).

> **Config-driven.** Read `.claude/stack.md` first. All project specifics below — issue tracker and
> its query/states/transitions, branch model, package manager, test runners, e2e tag, deploy gate —
> come from there. Notation `${a.b}` = that value from the config. If a referenced capability is
> `none` (e.g. no deploy gate, no e2e), **skip** that step. If `.claude/stack.md` is missing, run the
> `onboard` skill and stop.

**Scope is USER-SCOPED + the active iteration, never project-scoped.** Selection uses
`${issueTracker.myWorkQuery}` (e.g. for Jira: `assignee = currentUser() AND sprint in openSprints()`),
filtered by issue type and status. Don't widen it to the whole backlog and don't bolt on a project
filter unless the configured query already implies one.

- FIX / VERIFY operate on **bugs** (`issuetype = ${issueTracker.issueTypes.bug}`).
- STORY-VERIFY operates on **stories** (`${issueTracker.issueTypes.story}` and any extras in config);
  its AC check is **E2E-mandatory** (needs ≥1 passing `${testing.e2e.tagConvention}` scenario keyed to
  the issue; unit-only never satisfies the gate; no deploy gate; assignee left unchanged).
  Park file: `.claude/loops/state/my-stories-verify-parked.txt`.

## Bug lifecycle the loop drives

```
${states.todo} ─FIX(start)─▶ ${states.inProgress} ─FIX(devfix+PR, auto-merge when green)─▶ (merged to ${vcs.integrationBranch})
        ─FIX(reconcile)─▶ ${states.verify} ─(deploy runs, if deploy gate on)─▶ VERIFY(tests[+deploy gate])─▶ ${states.verified} ─▶ QA
```
If the tracker needs explicit transition ids (Jira), read them from `${issueTracker.transitionIds}`
(e.g. `{In Progress:21, Dev Testing:9, Ready for Testing:2}`); otherwise transition by target state name.

## The two jobs

| Job | Cron | When | Does |
|---|---|---|---|
| **FIX** | `*/5 6-20 * * 1-5` | weekdays **06:00–20:55** | reconcile prior PR → else start one `${states.todo}` bug (`devfix` + auto-merge when green) |
| **VERIFY** | `3-58/5 * * * *` | **any time** session is active | one `${states.verify}` bug → AC tests [+ deploy gate] → hand off |

Both: every 5 min (VERIFY staggered to :03/:08/… so the two never fire in the same instant), **one action per tick**, session-only (`durable: false`), auto-expire after 7 days.
Job IDs are assigned by `launch-loop-stack` at registration (`CronList` to see them).

> **Overlap guard** = `git status --porcelain` over the project's source/test dirs, ignoring the
> transient `.claude/scheduled_tasks.lock`.
> **Idle-gating:** ticks fire only while the REPL is idle, so a long `devfix`/test run suppresses overlapping ticks.

## FIX job — weekdays 06:00–20:55

**Step 1 — reconcile prior FIX work first** (`git fetch`; find a loop-created PR — head per
`${vcs.branchNaming}`, base `${vcs.integrationBranch}`, mine — for a bug now `${states.inProgress}`):
- **Merged** → transition bug `${states.inProgress}` → `${states.verify}` so VERIFY can pick it up. Stop.
- **Open + all checks green** → merge per `${vcs.autoMerge}` (e.g. `gh pr merge --squash`); on success → `${states.verify}`. Stop. (Blocked by branch protection / required approvals → leave open, note, stop — never override.)
- **Open + any pending/queued check** → stop (later tick retries).
- **Open + a failing check** → leave open — the **PR-SHEPHERD** loop triages and fixes it (see `.claude/loops/pr-shepherd.md`), stop.

> When `${integrations.superpowers}` is set, drive the merge/handoff in Step 1 with `superpowers:finishing-a-development-branch` — see `skills/shared/superpowers-integration.md`. Absent → use the steps as written; never block a tick on a missing plugin.

**Step 2 — start a new fix** (only if no in-flight loop PR):
1. Query bugs in `${states.todo}` via `${issueTracker.myWorkQuery}`. None → stop.
2. Overlap guard dirty → stop.
3. Pick one (priority DESC, lowest key). **Transition `${states.todo}` → `${states.inProgress}` before working** so it isn't re-picked.
4. `git fetch`; branch per `${vcs.branchNaming}` (default type `bug`) off latest `origin/${vcs.integrationBranch}`; run **`devfix`** (opens PR → `${vcs.integrationBranch}`). Enable auto-merge (`gh pr merge --auto --squash`) if supported (else Step 1 merges it when green later). Never force-merge / override protection. Stop.

## VERIFY job — any time, session active

1. Query bugs in `${states.verify}` via `${issueTracker.myWorkQuery}`, **excluding keys in `.claude/loops/state/my-bugs-verify-parked.txt`**. None → stop.
2. Overlap guard dirty (FIX may be mid-fix) → stop.
3. Pick one (priority DESC, lowest key).
4. `git fetch`; checkout the issue's branch if it exists, else `origin/${vcs.integrationBranch}`.
5. **Find AC-covering tests via the fix commit:** `git log --all --grep="<KEY>"` → `git show --name-only <fixSHA>`, take its test files. Unit-test locations come from `${testing.unit.locations}`. Run:
   - those AC-covering unit tests with `${testing.unit.runner}` (from the correct package/dir),
   - e2e (if `${testing.e2e.runner}` ≠ none): in `${testing.e2e.dir}`, run `${testing.e2e.bddStep}` then the e2e command filtered to the issue's `${testing.e2e.tagConvention}` tag. No matching scenario → e2e **N/A**.
   - **Coverage rule:** at least ONE test must exercise this bug's AC (the fix commit's test, or a tagged e2e). **None exists → PARK** (`echo "<KEY> # no AC coverage" >> .claude/loops/state/my-bugs-verify-parked.txt`) and stop — do **not** transition.
6. **Deploy gate (only if `${ci.deployGate}` is true):** fix commit in `origin/${vcs.integrationBranch}` **and** a **successful** relevant deploy run from `${ci.deployWorkflows}` includes it (fix SHA ancestor of run head SHA), via `gh`. If `${ci.deployGate}` is false, skip this gate.
7. **Only if all AC-covering tests green AND (deploy gate passes or is off):** transition → `${states.verified}` + set assignee per `${issueTracker.handoffAssignee}` (default `reporter` — hand the bug back to whoever reported it; leave as-is only if `none`) + comment (tests [+ deploy run]).
8. **Gaps:**
   - Genuine test **failure** that is the bug's own code (re-run once to rule out flake) → **PARK** (`# test fail: …`) and stop.
   - **Transient — do NOT park, retried next tick:** deploy pending/not-green → stop. OR an env/infra failure described in `${recoveryNotes}` → follow that runbook, don't park. **Never mark a bug failed for an env/infra reason.**
9. Leave the working tree clean (back on `origin/${vcs.integrationBranch}` or the configured base) when done.

> **Parking** (`.claude/loops/state/my-bugs-verify-parked.txt`) keeps a non-verifiable bug (no coverage, or a real failure) from being re-picked every tick and starving the queue. Parked = **needs a human**. Clear the file to un-park.

## Start / Stop / Adjust

- **Stop:** `stop-loop-stack`, or `CronDelete <id>` per job (`CronList` for ids), or close the session.
- **Re-register:** re-run `launch-loop-stack`.
- **Cadence:** edit the minute field (`*/5` → `*/10`, …). **FIX window:** edit the hour field (`6-20`).
- **Survive restarts:** register with `durable: true` (persists to `.claude/scheduled_tasks.json`).
- **Survive a closed terminal entirely:** use a cloud `/schedule` instead of session crons.

## Caveats

- Both jobs make real changes **unattended**: FIX transitions the tracker and opens + auto-merges green PRs into `${vcs.integrationBranch}`; VERIFY transitions to `${states.verified}` and may reassign per config. Both gate strictly on green tests; VERIFY also on deploy if the gate is on. Review output.
- A single `devfix`/verify run usually exceeds 5 min; overlap guards + idle-gating keep it to one at a time.
- Project-specific recovery steps (broken local edge, stale auth, flaky infra) belong in the `${recoveryNotes}` section of `.claude/stack.md`, not hardcoded here.

## Related
- `launch-loop-stack` / `stop-loop-stack` — register/tear down all loops.
- `devfix` — the skill each FIX tick runs. `.claude/loops/pr-review.md`, `.claude/loops/deploy-failure-fix.md` — the other loops.
