# Loop: my open PRs → shepherd to merge (review-respond / CI-fix / conflict-resolve)

A session-scoped cron that finds **my** open PRs (the ones the FIX and DEPLOY-FIX loops — or I —
opened) and unblocks **one per tick**. Without this loop, work the stack creates is orphaned the
moment a human requests changes, a check goes red, or the base branch moves: FIX's reconcile step
only looks at check status and stops. This loop closes those three feedback gaps. You own this
file — edit it, then re-register the cron.

> **Config-driven.** Read `.claude/stack.md` first. Repo and my handle come from `${project.repo}`
> and my identity from the VCS host's authenticated user (`@me` for `gh` — never a committed username,
> which would make every team member act on ONE person's PRs); `${project.username}` is only the fallback for hosts without an authenticated-user token. Branch model, commands, and test config from `${vcs.*}`, `${commands.*}`, `${testing.*}`. This
> loop must never act on PRs that are not mine. Commands below assume GitHub (`gh`); adapt to the
> configured `${project.vcsHost}` if different. If `.claude/stack.md` is missing, run `onboard`
> and stop.

## The three actions (priority order — pick the first that applies)

| Priority | Action | Trigger on the PR | What it does |
|---|---|---|---|
| 1 | **REVIEW-RESPOND** | `reviewDecision = CHANGES_REQUESTED`, or unresolved review threads | address each actionable comment, reply to every thread, re-request review |
| 2 | **CI-FIX** | a required check is **failing** | `pr-ci-failure-triage` scoped to this PR: diagnose the red check, minimal root-cause fix, push |
| 3 | **CONFLICT** | `mergeable = CONFLICTING` | merge the base branch into the PR branch, reconcile every conflict in context of both sides' intent |

One loop instead of three because all three act on the same target set (my open PRs) and would
otherwise contend for the same branches and overlap guard. Priority order matters: review feedback
first (a human is waiting), then red CI (blocks merge), then conflicts (blocks merge, no human
waiting).

## Schedule

| Setting | Value |
|---|---|
| Cadence | every **10 minutes** (`6,16,26,36,46,56 * * * *` — staggered off FIX/VERIFY `:00/:05`, STORY-VERIFY `:02`, DEPLOY-FIX `:04`, PR-REVIEW `:00/:10`) |
| When | **any time** the session is active |
| Scope | open PRs in `${project.repo}` **authored by `@me`** (the authenticated VCS user — works unchanged for every team member) — never anyone else's |
| Persistence | **session-only** (`durable: false`) — dies when the session exits |
| Auto-expiry | recurring cron auto-expires after **7 days** |

> **Idle-gating:** ticks fire only while the REPL is idle, so a long fix suppresses overlapping ticks.

## What each tick does

1. `git fetch origin`. List my open PRs:
   `gh pr list --state open --author "@me" --json number,title,headRefName,headRefOid,mergeable,reviewDecision,updatedAt`.
   For each candidate, also read check status (`gh pr checks <n>`) and unresolved review threads
   (GraphQL `reviewThreads(first: 50) { nodes { isResolved } }`).
2. **Dedupe:** skip any PR whose `"<number>@<headRefOid>"` is already in `.claude/loops/state/pr-shepherd-done.txt`
   (handled at that exact head; new commits move the head, and new review threads arrive on a new
   or same head — a same-head PR re-qualifies only via a **new unresolved thread** not present when
   it was recorded).
3. **Overlap guard** = `git status --porcelain` over the project's source/test dirs (ignoring the
   transient `.claude/scheduled_tasks.lock`) dirty → **STOP** (another loop is mid-work).
4. Pick **ONE** PR needing help, by the priority table above; ties → oldest `updatedAt`. None → **STOP**.
5. Act — **one action, one PR**:
   - **REVIEW-RESPOND:** checkout the PR branch. When `${integrations.superpowers}` is set, work the
     incoming comments through `superpowers:receiving-code-review` (see
     `skills/shared/superpowers-integration.md`); otherwise apply the discipline below directly.
     For each actionable comment: make the minimal
     change it asks for — with full **assertion integrity** (never weaken or delete a test to satisfy
     a comment without stating why in the reply). For comments you disagree with: reply with the
     technical reasoning, change nothing. Reply to **every** unresolved thread (what changed, or why
     not). Run `${commands.typecheck}` && `${commands.lint}`, then the **green gate**
     (`.claude/skills/shared/green-gate.md`) — full unit suite + full E2E suite green before pushing,
     not just tests targeted at the changed files. Commit per the PR's ticket key + the tracker's
     commit convention; push; re-request review from each reviewer who requested changes.
   - **CI-FIX:** run the **`pr-ci-failure-triage`** skill scoped to this one PR — read the failing
     check's logs (`gh run view <id> --log-failed`), classify, make the minimal root-cause fix on
     the PR branch, verify `${commands.typecheck}` && `${commands.lint}` and the green gate
     (`.claude/skills/shared/green-gate.md` — full unit + full E2E green), push.
     **PURE INFRA** (runner outage, secrets, quota, external registry) → not code-fixable: comment
     the diagnosis on the PR, record in the done-file, STOP. Never touch secrets.
   - **CONFLICT:** checkout the PR branch; `git merge origin/<the PR's base branch>`. Resolve each
     conflict **in the intent of both sides** — read both conflicting commits (and their tickets)
     before choosing; never blind-take ours/theirs. Run `${commands.typecheck}` && `${commands.lint}`
     and the green gate (`.claude/skills/shared/green-gate.md` — full unit + full E2E green; a merge
     resolution is exactly where a sibling suite breaks). Commit the merge; push. (Plain merge, never
     rebase + force-push — the branch may have review history or others' commits.)
6. Verify the push landed, then append `"<number>@<headRefOid-BEFORE-the-action>"` to
   `.claude/loops/state/pr-shepherd-done.txt`. If the PR turned out to need a **human** (unresolvable disagreement,
   pure infra, a fix you cannot make safely) → say exactly that in a PR comment **and** record it in
   the done-file with `# needs-human: <one-line>` so it isn't retried every tick — the DAILY-REPORT
   loop surfaces these.
7. Return to the configured base branch, leave the working tree clean. **STOP.**

**One PR per tick. Never force-push, never override branch protection, never touch a PR I didn't author.**

## Interaction with the other loops

- **FIX** reconcile leaves a failing-check PR open — this loop is the consumer of that hand-off.
- **PR-REVIEW** handles *incoming* review requests (others' PRs); this loop handles *outgoing*
  feedback on mine. The two never target the same PR.
- Merges still happen only via FIX reconcile / auto-merge when green — this loop gets a PR *ready*
  to merge; it never merges.

## Start / Stop / Adjust

- **Stop:** `stop-loop-stack`, or `CronDelete <id>` (`CronList` for ids), or close the session.
- **Re-register** (after editing this file / new session): re-run `launch-loop-stack`.
- **Cadence:** edit the minute list. **Re-handle a PR from scratch:** remove its lines from `.claude/loops/state/pr-shepherd-done.txt`.
- **Survive restarts:** register with `durable: true`. **Survive a closed terminal:** use a cloud `/schedule`.

## Caveats

- Makes real changes **unattended**: pushes commits to my open PR branches and replies to review
  threads. It gates on typecheck/lint/targeted tests and never merges, force-pushes, or overrides
  protection. Review its replies — they carry your voice.
- Assertion integrity is a hard rule for REVIEW-RESPOND: a reviewer comment is never a license to
  weaken a test.

## Related

- `.claude/loops/my-bugs-in-sprint-devfix.md` — FIX/VERIFY (creates most of the PRs this loop shepherds).
- `.claude/loops/pr-review.md` — reviewing *others'* PRs. `.claude/loops/daily-report.md` — surfaces `needs-human` PRs.
- `pr-ci-failure-triage` — the skill CI-FIX runs.
