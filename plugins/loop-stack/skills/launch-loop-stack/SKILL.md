---
name: launch-loop-stack
description: Launch the full autonomous loop stack for the current session — the FIX, VERIFY, STORY-VERIFY, PR-REVIEW, DEPLOY-FIX, PR-SHEPHERD, SYNC-INTEGRATION, and DAILY-REPORT recurring ticks — by creating their session crons in one shot. Use when the user says "launch the loops", "start the loop stack", "set up the my-work loops", "run the autonomous loops", or after a session restart where the prior crons were lost. Each loop is one-action-per-tick, reads .claude/stack.md for all project specifics, and never overrides branch protection. Full per-loop specs live in .claude/loops/.
---

# Launch Loop Stack

## Purpose

Create the session-scoped recurring crons that drive the autonomous **"my work in the active iteration"** workflow against this repo.

> **Config-driven — read `.claude/stack.md` first.** Every loop reads its project specifics (issue
> tracker + `${issueTracker.myWorkQuery}`/states/transitions, `${vcs.*}` branch model, `${commands.*}`,
> `${testing.*}`, `${ci.*}`) from that file. If it's missing, run the **`onboard`** skill first and stop.
> Only register loops the config supports: skip DEPLOY-FIX when `${ci.deployWorkflows}` is empty; skip
> the e2e gate when `${testing.e2e.runner}` is `none`; skip PR-REVIEW only when the VCS host has no review-request concept (reviewer identity is `@me`, not a committed handle);
> skip PR-SHEPHERD when the VCS host has no authenticated-user concept (identity is `@me` — the authenticated `gh` user, never a committed username, so shared config works for every team member);
> skip SYNC-INTEGRATION when `${vcs.fixBaseBranches}` is empty or every fix base equals its env branch.
> DAILY-REPORT always applies (push notification needs no config; `${reporting.destination}` is optional).

| Loop | Cadence | Cron expression | Spec |
|---|---|---|---|
| **FIX** | weekdays 06:00–20:55, every 5 min | `*/5 6-20 * * 1-5` | `.claude/loops/my-bugs-in-sprint-devfix.md` |
| **VERIFY** | any time, every 5 min at :03/:08/… | `3-58/5 * * * *` | `.claude/loops/my-bugs-in-sprint-devfix.md` |
| **STORY-VERIFY** | any time, every 5 min at :02/:07/… | `2-57/5 * * * *` | `.claude/loops/my-bugs-in-sprint-devfix.md` |
| **PR-REVIEW** | every 10 min | `*/10 * * * *` | `.claude/loops/pr-review.md` |
| **DEPLOY-FIX** | every 10 min at :04/:14/… | `4,14,24,34,44,54 * * * *` | `.claude/loops/deploy-failure-fix.md` |
| **PR-SHEPHERD** | every 10 min at :06/:16/… | `6,16,26,36,46,56 * * * *` | `.claude/loops/pr-shepherd.md` |
| **SYNC-INTEGRATION** | twice hourly at :09/:39 | `9,39 * * * *` | `.claude/loops/sync-integration.md` |
| **DAILY-REPORT** | weekdays 16:59, once | `59 16 * * 1-5` | `.claude/loops/daily-report.md` |

These are **session-only** (auto-expire after 7 days, stop when the session ends). They never force-merge or override branch protection.

**Scoping invariant — USER-SCOPED + active iteration, never the whole backlog.** Every tracker-querying
loop selects work with `${issueTracker.myWorkQuery}` (e.g. Jira `assignee = currentUser() AND sprint in
openSprints()`), filtered by issue type + status. Don't broaden it to the historical backlog. PR-REVIEW
is scoped to the authenticated user (`@me`); DEPLOY-FIX by repo/branch.

## When to use

- User says: "launch the loops", "start the loop stack", "set up / restart the loops", "run the autonomous loops".
- After a session restart where the previously-created crons no longer fire.

## How to launch (do this when invoked)

1. **Load config.** Read `.claude/stack.md`. Missing → run `onboard`, stop. Substitute its values into the prompts below (everything in `${...}`).
2. **Prepare the state dir.** All loop park/dedupe files live in the project's **`.claude/loops/state/`** — per-project by construction, survives reboots, never global `/tmp` (shared across projects: issue keys, PR numbers, and deploy run IDs from different repos would collide there). `mkdir -p .claude/loops/state` and ensure `.claude/loops/state/` is in `.gitignore` (append if missing). Legacy `/tmp/*.txt` state from older stack versions is **not** migrated automatically (it may mix projects) — migrate lines by hand if needed.
3. **Materialize the loop specs.** The cron prompts reference `.claude/loops/<spec>.md` in the project. For any loop being launched whose spec is missing there, copy it from the stack source — plugin install: `${CLAUDE_PLUGIN_ROOT}/loops/`; repo/manual copy: the `loops/` dir that ships next to this skill's `skills/` parent. Never overwrite an existing project spec (the project may have customized it — "you own this file").
4. **Check for duplicates.** `CronList`; if an equivalent prompt already exists for a loop, report its job ID instead of creating a second. Only create missing loops.
5. **Create each missing, applicable loop** with `CronCreate` (`recurring: true`) using the cron expression + the resolved prompt. The prompt IS the per-tick instruction fired into a fresh session.
6. **Report** every job ID created (and any skipped — as duplicate, or as N/A for this project's config), the cadence, that they're session-only + auto-expire in 7 days, and how to stop (`stop-loop-stack` / `CronDelete <id>` / `CronList`).
7. Don't run a tick inline now unless asked — the crons fire on their own schedule.

> Demo / release freezes are situational and NOT baked in. Honor a declared freeze ad hoc (skip merges/deploys during it).

> **Superpowers (optional).** When `${integrations.superpowers}` is set, ticks that fan out an agent team (FIX runs `devfix`; PR-SHEPHERD's parallel triage) may drive that fan-out with `superpowers:dispatching-parallel-agents` / `superpowers:subagent-driven-development`, and any merge/handoff step (FIX Step 1, PR-SHEPHERD) with `superpowers:finishing-a-development-branch` — see `skills/shared/superpowers-integration.md`. Absent → use the built-in tick logic. Never let a missing superpowers plugin block a tick.

---

### Loop 1 — FIX  (`cron: */5 6-20 * * 1-5`, recurring)

```
Autonomous "my bugs" — FIX TICK (weekday work hours). First read .claude/stack.md. BUGS ONLY: issue type = ${issueTracker.issueTypes.bug}, selected via ${issueTracker.myWorkQuery} — USER-SCOPED + active iteration, not the whole backlog. One action per tick. Full spec: .claude/loops/my-bugs-in-sprint-devfix.md

STEP 1 — RECONCILE prior FIX work first. git fetch origin. Look for a PR this loop created (head per ${vcs.branchNaming}, base ${vcs.integrationBranch}, author me) for a bug currently in ${states.inProgress}:
- MERGED → transition that bug ${states.inProgress}→${states.verify} (by state name, or transition id from ${issueTracker.transitionIds} if the tracker needs it) so VERIFY can pick it up. STOP.
- OPEN, all required checks GREEN → merge per ${vcs.autoMerge} (e.g. `gh pr merge --squash`); on success transition the bug→${states.verify}. STOP. (Blocked by branch protection/required approvals → leave open, note, STOP — never override.)
- OPEN, any check PENDING/queued → STOP (a later tick retries).
- OPEN, a check FAILING → leave open — the PR-SHEPHERD loop triages and fixes it. STOP.

STEP 2 — START a new fix (only if no in-flight loop PR from step 1). Query my bugs in ${states.todo} via ${issueTracker.myWorkQuery} (status = ${states.todo}, ORDER BY priority DESC, key ASC). None → STOP.
- Overlap guard: `git status --porcelain` over the project's source/test dirs shows ANY change other than .claude/scheduled_tasks.lock → STOP.
- Pick ONE (priority DESC, tie-break lowest key). Transition it ${states.todo}→${states.inProgress} BEFORE working, so it is not re-picked next tick.
- git fetch origin; create a branch per ${vcs.branchNaming} (default type bug) off latest origin/${vcs.integrationBranch}; run the devfix skill (opens a PR → ${vcs.integrationBranch}). Enable auto-merge if supported: `gh pr merge --auto --squash`. If unsupported, STEP 1 merges it when green later. Never force-merge or override branch protection. STOP.
```

### Loop 2 — VERIFY  (`cron: 3-58/5 * * * *`, recurring)

```
Autonomous "my bugs" — VERIFY TICK (any time, session active). First read .claude/stack.md. BUGS ONLY: issue type = ${issueTracker.issueTypes.bug}, via ${issueTracker.myWorkQuery} — USER-SCOPED + active iteration. One bug per tick. Full spec: .claude/loops/my-bugs-in-sprint-devfix.md
1. Query my bugs in status ${states.verify} via ${issueTracker.myWorkQuery} (ORDER BY priority DESC, key ASC), EXCLUDING any key in .claude/loops/state/my-bugs-verify-parked.txt. None → STOP.
2. Overlap guard: `git status --porcelain` over source/test dirs shows ANY change other than .claude/scheduled_tasks.lock → STOP (FIX may be mid-devfix).
3. Pick ONE (priority DESC, tie-break lowest key).
4. git fetch origin; checkout the issue's branch if it exists, else origin/${vcs.integrationBranch}.
5. Find AC-covering tests via the fix commit: `git log --all --grep="<KEY>"` → `git show --name-only <fixSHA>` and take its test files (unit-test locations: ${testing.unit.locations}). Run:
   - those AC-covering unit tests with ${testing.unit.runner} (correct package/dir),
   - if ${testing.e2e.runner} ≠ none: in ${testing.e2e.dir}, run ${testing.e2e.bddStep} then the e2e command filtered to the issue's ${testing.e2e.tagConvention} tag. No matching scenario → e2e N/A.
   COVERAGE RULE: at least ONE test must exercise THIS bug's AC. If NONE → PARK: append "<KEY> # no AC coverage" to .claude/loops/state/my-bugs-verify-parked.txt and STOP — do NOT transition.
6. Deploy gate — ONLY if ${ci.deployGate} is true: fix commit in origin/${vcs.integrationBranch} AND a SUCCESSFUL run of a relevant workflow from ${ci.deployWorkflows} includes it (fix SHA ancestor of run head SHA), via gh. If ${ci.deployGate} is false, skip this gate.
7. ONLY IF all AC-covering tests GREEN AND (deploy gate passes or is off): transition issue→${states.verified} (by state name / id from ${issueTracker.transitionIds}) + set assignee per ${issueTracker.handoffAssignee} (default reporter — hand the bug back to whoever reported it; leave as-is only if none) + add a comment (tests [+ deploy run]).
8. Gaps:
   - Genuine test FAILURE that is the bug's own code (re-run once to rule out flake) → PARK ("<KEY> # test fail: <one-line>") and STOP.
   - TRANSIENT (do NOT park; retried next tick): deploy not yet green/pending → STOP. OR an env/infra failure described in ${recoveryNotes} → follow that runbook. Never mark a bug failed for an env/infra reason.
9. Leave the working tree clean (back on origin/${vcs.integrationBranch} or the configured base).
```

### Loop 3 — STORY-VERIFY  (`cron: 2-57/5 * * * *`, recurring)

```
Autonomous "my stories" — STORY-VERIFY TICK (any time, session active). First read .claude/stack.md. ISSUE TYPES: ${issueTracker.issueTypes.story} (+ any extras in config) via ${issueTracker.myWorkQuery} — USER-SCOPED + active iteration. One issue per tick. AC VERIFICATION IS E2E-MANDATORY.
1. Query the tracker (connection ${issueTracker.connection}): story-type issues in status ${states.verify} via ${issueTracker.myWorkQuery} (ORDER BY priority DESC, key ASC), EXCLUDING any key in .claude/loops/state/my-stories-verify-parked.txt. None → STOP.
2. Overlap guard: `git status --porcelain` over source/test dirs shows ANY change other than .claude/scheduled_tasks.lock → STOP.
3. Pick ONE (priority DESC, tie-break lowest key).
4. git fetch origin; checkout the issue's branch if it exists, else origin/${vcs.integrationBranch}.
5. AC COVERAGE — E2E IS THE MANDATORY GATE (requires ${testing.e2e.runner} ≠ none). ACs MUST be verified by e2e scenarios tagged with the issue's ${testing.e2e.tagConvention}:
   - in ${testing.e2e.dir}, run ${testing.e2e.bddStep} then the e2e command filtered to that tag.
   - COVERAGE RULE: at least ONE tagged e2e scenario MUST exist AND exercise this story's AC. If NONE → PARK: append "<KEY> # no e2e AC coverage" to .claude/loops/state/my-stories-verify-parked.txt and STOP. (Unit-only is NOT sufficient for a story.)
   - Also run the AC-covering unit tests for completeness (${testing.unit.runner}); a unit failure is still a failure (step 7), but unit alone never satisfies the AC gate.
6. GATE = the tagged e2e scenarios are GREEN (and AC-covering unit tests GREEN). NO deploy gate. ONLY THEN: transition the story → ${states.verified} (by state name / id from ${issueTracker.transitionIds}) and add a brief human-voice comment listing the e2e + unit tests run. DO NOT change the assignee.
7. Gaps: genuine test FAILURE that is the story's own code (re-run once) → PARK ("<KEY> # test fail: <one-line>") and STOP. TRANSIENT env/infra failure per ${recoveryNotes} → follow that runbook, don't park. Never mark a story failed for an env/infra reason.
8. Leave the working tree clean. One story per tick. Session-only.
```

### Loop 4 — PR-REVIEW  (`cron: */10 * * * *`, recurring)

```
Autonomous PR-REVIEW TICK — review open PRs in ${project.repo} that request MY review ("@me" — the authenticated gh user)${vcs.prReview.watchAuthors ? ", authored by one of ${vcs.prReview.watchAuthors}" : ""}. First read .claude/stack.md. One PR per tick.
1. List them: `gh pr list --state open --search "review-requested:@me [author:<each watchAuthors, if any>]" --json number,title,headRefName,headRefOid,updatedAt` (fallback: GitHub MCP search_pull_requests, query "repo:${project.repo} is:open is:pr review-requested:@me [author:…]"). With no watchAuthors, omit the author filter.
2. Dedupe: skip any PR whose "<number>@<headRefOid>" is already in .claude/loops/state/pr-review-done.txt (re-review only if new commits pushed).
3. None remain → STOP.
4. Pick ONE (oldest updatedAt). Invoke the github-pr-review skill against that PR — review the diff cold, post findings as a PR review.
5. After the review is posted, append "<number>@<headRefOid>" to .claude/loops/state/pr-review-done.txt.
One PR per tick. Review + post only — never merge or change code. Session-only.
```

### Loop 5 — DEPLOY-FIX  (`cron: 4,14,24,34,44,54 * * * *`, recurring) — skip if ${ci.deployWorkflows} is empty

```
Autonomous DEPLOY-FIX TICK (any time, session active). First read .claude/stack.md. Find a FAILED deployment among ${ci.deployWorkflows} and fix it. One deployment per tick. Full spec: .claude/loops/deploy-failure-fix.md

1. git fetch origin. For each workflow in ${ci.deployWorkflows} (grouped by env), take its latest run on the env branch ${vcs.envBranches[env]}: `gh run list --workflow=<file> --branch=<env-branch> --limit 1 --json databaseId,headSha,conclusion,status,createdAt`. Failed = conclusion=failure (ignore in_progress/queued/success/cancelled). Envs in ${ci.humanGatedEnvs} are NOT watched.
2. DEDUPE: skip any whose "<databaseId>" is in .claude/loops/state/deploy-fix-done.txt. None failed/unhandled → STOP.
3. Overlap guard: `git status --porcelain` over source/test dirs shows ANY change other than .claude/scheduled_tasks.lock → STOP.
4. Pick ONE failed run (newest createdAt). Diagnose from `gh run view <databaseId> --log-failed` + the workflow file. Check ${recoveryNotes} for known infra causes. Classify:
   - CODE/CONFIG fixable (build/type/lint, bad import, migration SQL, workflow yaml, env var referenced in repo, missing file) → fix it.
   - PURE INFRA/secret/external (cloud creds, quota, registry/runner outage) → NOT code-fixable: append "<databaseId> # infra: <one-line>" to .claude/loops/state/deploy-fix-done.txt, report, STOP. Never edit secrets or override anything.
5. To fix (CODE/CONFIG only): base branch = ${vcs.fixBaseBranches[env]} (fall back to the env branch). Create branch "fix/deploy-<scope>-<env>-<databaseId>". Make the MINIMAL root-cause fix; add a covering test where practical. Run ${commands.typecheck} && ${commands.lint} (+ targeted tests) — must pass.
6. Commit per the tracker's no-ticket convention + Conventional Commit: "fix(<scope>): <what> (deploy <env> <workflow>)". Push. Open PR with `gh pr create --base <env-branch>`, body = failing run link + root cause + fix. Enable auto-merge per ${vcs.autoMerge}: `gh pr merge --auto --squash`. Never force-merge / override branch protection.
7. Append "<databaseId> # fixed via PR #<n>" to .claude/loops/state/deploy-fix-done.txt. Return to the configured base branch, leave the tree clean. STOP.
```

### Loop 6 — PR-SHEPHERD  (`cron: 6,16,26,36,46,56 * * * *`, recurring) — skip if the VCS host has no authenticated-user concept

```
Autonomous PR-SHEPHERD TICK (any time, session active). First read .claude/stack.md. Shepherd MY open PRs in ${project.repo} (author "@me" — the authenticated gh user, NOT a committed username) — the loops (or I) opened them and nobody else will finish them. ONE action on ONE PR per tick. Full spec: .claude/loops/pr-shepherd.md

1. git fetch origin. List my open PRs: `gh pr list --state open --author "@me" --json number,title,headRefName,headRefOid,mergeable,reviewDecision,updatedAt`; per candidate also read check status (`gh pr checks <n>`) and unresolved review threads (GraphQL reviewThreads, isResolved=false).
2. DEDUPE: skip any PR whose "<number>@<headRefOid>" is in .claude/loops/state/pr-shepherd-done.txt (handled at that head; new commits or new unresolved threads re-qualify it).
3. Overlap guard: `git status --porcelain` over source/test dirs shows ANY change other than .claude/scheduled_tasks.lock → STOP.
4. Pick ONE PR needing help, priority order (ties → oldest updatedAt): (a) REVIEW-RESPOND: reviewDecision=CHANGES_REQUESTED or unresolved threads; (b) CI-FIX: a required check FAILING; (c) CONFLICT: mergeable=CONFLICTING. None → STOP.
5. Act — one action, one PR:
   - REVIEW-RESPOND: checkout the PR branch; address each actionable comment with the minimal change (assertion integrity — NEVER weaken or delete a test to satisfy a comment without stating why in the reply); for comments I disagree with, reply with technical reasoning and change nothing; reply to EVERY unresolved thread; run ${commands.typecheck} && ${commands.lint} + tests targeted at changed files — must pass; commit per the PR's ticket key + convention; push; re-request review from each reviewer who requested changes.
   - CI-FIX: run the pr-ci-failure-triage skill scoped to this PR — diagnose the failing check from `gh run view <id> --log-failed`, minimal root-cause fix on the PR branch, verify ${commands.typecheck} && ${commands.lint} (+ targeted tests), push. PURE INFRA (runner/secrets/quota/registry) → comment the diagnosis on the PR, record in the done-file, STOP. Never touch secrets.
   - CONFLICT: checkout the PR branch; `git merge origin/<PR base branch>`; resolve each conflict in the intent of BOTH sides (read both conflicting commits/tickets first — never blind-take ours/theirs); run ${commands.typecheck} && ${commands.lint} + tests touching conflicted files — must pass; commit the merge; push. Plain merge, never rebase + force-push.
6. Verify the push landed; append "<number>@<headRefOid-BEFORE>" to .claude/loops/state/pr-shepherd-done.txt. Needs a HUMAN (unresolvable disagreement, pure infra, no safe fix) → say so in a PR comment AND record "# needs-human: <one-line>" in the done-file so it isn't retried (DAILY-REPORT surfaces these).
7. Return to the configured base branch, leave the tree clean. One PR per tick. Never force-push, never merge, never override branch protection, never touch a PR I didn't author. Session-only.
```

### Loop 7 — SYNC-INTEGRATION  (`cron: 9,39 * * * *`, recurring) — skip if ${vcs.fixBaseBranches} is empty or every fix base equals its env branch

```
Autonomous SYNC-INTEGRATION TICK (any time, session active). First read .claude/stack.md. Keep every ${vcs.fixBaseBranches[env]} current with its env branch ${vcs.envBranches[env]} so DEPLOY-FIX never branches off a stale base. One branch pair per tick. Full spec: .claude/loops/sync-integration.md

1. git fetch origin. For each env where ${vcs.fixBaseBranches[env]} is set AND differs from ${vcs.envBranches[env]}: count `git rev-list --count origin/<fixBase>..origin/<envBranch>`. All zero → STOP (in sync).
2. DEDUPE/BLOCKED: skip any pair listed in .claude/loops/state/sync-integration-blocked.txt (a human must resolve those; clear the line to retry).
3. Overlap guard: `git status --porcelain` over source/test dirs shows ANY change other than .claude/scheduled_tasks.lock → STOP.
4. Pick ONE pair (most commits behind). Checkout origin/<fixBase> into a temp local branch; `git merge origin/<envBranch>`:
   - CLEAN (or fast-forward) → run ${commands.typecheck} if the merge brought code changes (skip for docs-only) — must pass → push to origin/<fixBase>. If the push is rejected by branch protection → do NOT override; record the pair in the blocked file with "# protected: open a promote PR by hand" and STOP.
   - CONFLICT → abort the merge (`git merge --abort`); append "<fixBase> # conflict with <envBranch>: <one-line>" to .claude/loops/state/sync-integration-blocked.txt (DAILY-REPORT surfaces it) and STOP — conflicted promote merges need a human.
5. Return to the configured base branch, leave the tree clean. One pair per tick. Never force-push, never override protection. Session-only.
```

### Loop 8 — DAILY-REPORT  (`cron: 59 16 * * 1-5`, recurring)

```
Autonomous DAILY-REPORT TICK (once per weekday, end of day). First read .claude/stack.md. READ-ONLY + one notification — never changes code, PRs, branches, or tracker state. Full spec: .claude/loops/daily-report.md

1. Gather the last 24h: merged PRs (`gh pr list --state merged --author "@me" --search "merged:>=<24h-ago>"`); my open PRs + what each waits on (checks/review/conflict); tracker issues I transitioned or commented in the window (via ${issueTracker.myWorkQuery} + changelogs); reviews posted (.claude/loops/state/pr-review-done.txt); deploy incidents (.claude/loops/state/deploy-fix-done.txt); and ALL PARKED items — every line of .claude/loops/state/my-bugs-verify-parked.txt, .claude/loops/state/my-stories-verify-parked.txt, every "# needs-human" line in .claude/loops/state/pr-shepherd-done.txt, and every line of .claude/loops/state/sync-integration-blocked.txt.
2. Compose a short human-voice standup summary: Done (merged/verified) · In flight (open PRs + blocker) · Blocked/parked (each with its one-line reason — this section is the loop's reason to exist) · Incidents (deploy fixes/infra).
3. Deliver: if ${reporting.destination} is set, post the summary there; ALWAYS also send a PushNotification with the one-line headline (e.g. "3 merged, 2 verified, 1 parked (KEY-123: no AC coverage)").
4. Quiet-day rule: nothing happened AND nothing parked → send nothing. Parked items exist → ALWAYS report; they repeat daily until a human clears them. Session-only.
```

---

## Stopping the stack

- **`stop-loop-stack`** — the inverse skill: deletes every loop cron in one shot. Prefer it over manual deletion.
- `CronList` — show all scheduled jobs + IDs. `CronDelete <id>` — stop one loop manually.
- The stack stops on its own when the session ends; recurring jobs also auto-expire after 7 days.

## Related

- `.claude/loops/*.md` — full per-loop specs (recovery, deploy-gate detail, story e2e-gate).
- `onboard` — writes `.claude/stack.md` (run once per project before launching).
- `devfix` — the skill each FIX tick runs. `github-pr-review` — the skill each PR-REVIEW tick runs.
