# Loop: failed deployments → auto-fix PR

A session-scoped cron that watches the configured deploy workflows and, when one is **red**,
diagnoses the cause and — if it's code/config — opens a fix PR off the matching base branch.
Pure-infra failures are reported, never "fixed". You own this file — edit it, then re-register.

> **Config-driven.** Read `.claude/stack.md` first. Watched workflows, env→branch mapping, fix base
> branches, package manager, and human-gated envs all come from there (`${...}`). If `${ci.host}` is
> `none` or `${ci.deployWorkflows}` is empty, this loop has nothing to watch — don't register it.
> If `.claude/stack.md` is missing, run `onboard` and stop.

## Environment → base branch → PR target

From config: for each env in `${ci.deployWorkflows}`, the deploy trigger branch is `${vcs.envBranches[env]}`,
the fix is branched off `${vcs.fixBaseBranches[env]}` (fall back to the env branch if unset), and the PR
base is the env branch. Example (the `${vcs.*}` may encode this directly):

| Env | Deploy trigger branch | Fix branched off | PR base |
|---|---|---|---|
| dev | `${envBranches.dev}` | `${fixBaseBranches.dev}` | `${envBranches.dev}` |
| stage | `${envBranches.stage}` | `${fixBaseBranches.stage}` | `${envBranches.stage}` |

Envs listed in `${ci.humanGatedEnvs}` (e.g. prod) are **never** watched — those releases stay human-gated.

## Schedule

| Setting | Value |
|---|---|
| Cadence | every **10 minutes** (`4,14,24,34,44,54 * * * *` — off the :00/:30 marks) |
| When | **any time** the session is active |
| Persistence | **session-only** (`durable: false`) — dies when the session exits |
| Auto-expiry | recurring cron auto-expires after **7 days** |

> **Idle-gating:** ticks fire only while the REPL is idle, so a long fix suppresses overlapping ticks.

## What each tick does

1. `git fetch origin`. For each workflow in `${ci.deployWorkflows}`, take the **latest** run on its env branch
   (`gh run list --workflow=<file> --branch=<env-branch> --limit 1 --json databaseId,headSha,conclusion,status,createdAt`).
   Failed = `conclusion == failure` (ignore in_progress/queued/success/cancelled).
2. **Dedupe** on `databaseId` against `.claude/loops/state/deploy-fix-done.txt`. None left → **STOP**.
3. **Overlap guard** = `git status --porcelain` over the project's source/test dirs (ignoring `.claude/scheduled_tasks.lock`) dirty → **STOP** (another loop mid-fix).
4. Pick **one** failed run (newest). Diagnose from `gh run view <id> --log-failed` + the workflow file, and classify:
   - **CODE/CONFIG** (build/type/lint error, bad import, migration SQL, workflow yaml, missing file, an env var referenced in the repo) → fix it.
   - **PURE INFRA** (cloud credentials, quota, registry/runner outage) → **not** code-fixable: record `# infra: …` in the done-file, report, **STOP**. Never touch secrets or override anything.
5. **Fix (code/config only):** branch off the env's fix base → `fix/deploy-<scope>-<env>-<id>`; minimal root-cause fix; add a covering test where practical; `${commands.typecheck} && ${commands.lint}` must pass, then the **green gate** (`.claude/skills/shared/green-gate.md`) — full unit suite + full E2E suite green before the PR opens. No harness for a stream → record `suggested-scaffold` in the PR body (offer `scaffold-test-projects`: Gherkin + page objects + typed web elements + hooks); never skip it silently.
6. Commit per the tracker convention (no ticket → use the project's "chore/no-ticket" convention, e.g. `${KEY}-000` if Jira-style, or a plain Conventional Commit): `fix(<scope>): <what> (deploy <env> <workflow>)`; push; `gh pr create --base <env-branch>`; enable auto-merge per `${vcs.autoMerge}` (`gh pr merge --auto --squash` — merges only when green + protection satisfied; **never** force-merge).
7. Append `"<id> # fixed via PR #<n>"` to `.claude/loops/state/deploy-fix-done.txt`; return to the configured base branch; leave tree clean. **STOP.**

**One deployment per tick. Code/config → fix PR; pure infra → report only.**

> Known-flaky workflows or recurring infra causes belong in the `${recoveryNotes}` section of
> `.claude/stack.md` — check it before acting so a known infra failure isn't mistaken for a code defect.

## Start / Stop / Adjust

- **Stop:** `stop-loop-stack`, or `CronDelete <id>` (`CronList` for ids), or close the session.
- **Re-register** (after editing this file / new session): re-run `launch-loop-stack`.
- **Cadence:** edit the minute list. **Re-handle a run from scratch:** remove its id from `.claude/loops/state/deploy-fix-done.txt`.
- **Survive restarts:** register with `durable: true`. **Survive a closed terminal:** use a cloud `/schedule`.

## Caveats

- Makes real changes **unattended**: opens (and auto-merges-when-green) fix PRs into the env branches.
  It gates strictly on `${commands.typecheck}`/`${commands.lint}`/tests and on branch protection; pure-infra failures are never "fixed".
- Coordinates with the other loops via the shared overlap guard + idle-gating (one fix at a time).

## Related
- `.claude/loops/my-bugs-in-sprint-devfix.md` — bug fix/verify loop. `.claude/loops/pr-review.md` — PR-review loop.
