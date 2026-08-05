# Loop: "My Stories" → auto-implement (Harvest → Brief → small team → PR)

Session-scoped cron loop over the current user's assigned **implementable work** — the issue types
in `${issueTracker.issueTypes.implement}` (set at onboarding; empty = this loop is never
registered). The feature-path counterpart to FIX: FIX fixes bugs via `devfix`; IMPLEMENT builds
stories/tasks via an architect-briefed small team. You own this file — edit it, then re-register
(see *Start / Stop*).

> **Config-driven.** Read `.claude/stack.md` first. All project specifics — issue tracker
> query/states/transitions, branch model, package manager, test runners, design tool — come from
> there. Notation `${a.b}` = that value from the config. If a referenced capability is `none`,
> **skip** that step. If `.claude/stack.md` is missing, run the `onboard` skill and stop.

**Scope is USER-SCOPED + the active iteration, never project-scoped.** Selection uses
`${issueTracker.myWorkQuery}` filtered to `issuetype in ${issueTracker.issueTypes.implement}` and
status. Don't widen it to the whole backlog.

## Story lifecycle the loop drives

```
${states.todo} ─IMPLEMENT(start)─▶ ${states.inProgress} ─IMPLEMENT(team+PR, auto-merge when green)─▶ (merged to ${vcs.integrationBranch})
        ─IMPLEMENT(reconcile)─▶ ${states.verify} ─▶ STORY-VERIFY (E2E-mandatory AC gate, existing loop) ─▶ ${states.verified} ─▶ QA
```

Downstream is untouched machinery: **STORY-VERIFY** verifies, **PR-SHEPHERD** fixes red PR checks,
**DAILY-REPORT** escalates parked items.

## The job

| Job | Cron | When | Does |
|---|---|---|---|
| **IMPLEMENT** | `1,21,41 6-20 * * 1-5` | weekdays **06:01–20:41**, every 20 min | reconcile prior PR → else Harvest → Brief → implement one `${states.todo}` story |

Every 20 min (a story implementation is heavier than a bugfix), staggered to `:01/:21/:41` so it
never coincides with FIX (`:00 mod 5`), STORY-VERIFY (`:02`), VERIFY (`:03`), DEPLOY-FIX
(`:04 mod 10`), PR-SHEPHERD (`:06 mod 10`) or E2E-SWEEP (`:11/:31/:51`). **One action per tick**,
session-only (`durable: false`), auto-expire after 7 days.

> **Overlap guard** = `git status --porcelain` over the project's source/test dirs, ignoring the
> transient `.claude/scheduled_tasks.lock`.
> **Idle-gating:** ticks fire only while the REPL is idle, so a long implementation run suppresses
> overlapping ticks.

## Step 1 — reconcile prior IMPLEMENT work first

`git fetch origin`; find a loop-created PR (head per `${vcs.branchNaming}`, base
`${vcs.integrationBranch}`, mine) for an implement-type issue now `${states.inProgress}`:

- **Merged** → transition issue `${states.inProgress}` → `${states.verify}` so STORY-VERIFY picks
  it up. Stop.
- **Open + all checks green** → merge per `${vcs.autoMerge}`; on success → `${states.verify}`.
  Stop. (Blocked by branch protection / required approvals → leave open, note, stop — never
  override.)
- **Open + any pending/queued check** → stop (later tick retries).
- **Open + a failing check** → leave open — **PR-SHEPHERD** triages and fixes it. Stop.

> When `${integrations.superpowers}` is set, drive the merge/handoff with
> `superpowers:finishing-a-development-branch` — see `skills/shared/superpowers-integration.md`.
> Absent → the steps as written; never block a tick on a missing plugin.

## Step 2 — start a new story (only if no in-flight loop PR)

1. Query `${issueTracker.issueTypes.implement}` issues in `${states.todo}` via
   `${issueTracker.myWorkQuery}`, **excluding keys in
   `.claude/loops/state/my-stories-implement-parked.txt`**. None → stop.
2. Overlap guard dirty → stop.
3. Pick one (priority DESC, lowest key). **Transition `${states.todo}` → `${states.inProgress}`
   before working** so it isn't re-picked.
4. `git fetch`; branch per `${vcs.branchNaming}` (default type `feat`) off latest
   `origin/${vcs.integrationBranch}`.
5. **Phase H — Harvest (mandatory).** Dispatch the issue harvester agent (**Harvey**) for the full
   ticket context: description, comments, subtask/parent, Epic chain, related issues, linked docs
   pages, design links → structured AC YAML.
6. **Phase B — Brief (mandatory).** Dispatch the **architect** agent (**Archie**) with Harvey's
   output. Returns the binding Architecture Brief.
   - `scope_verdict: needs-decomposition` → **park**: append `<KEY> # <verdict_reason>` to
     `.claude/loops/state/my-stories-implement-parked.txt`, transition the issue back to
     `${states.todo}`, delete the branch, stop. Parked = needs a human (DAILY-REPORT escalates;
     remove the line to un-park).
7. **Phase I — Implement, as a small team.** Route by design presence:
   - Harvey surfaced design links **and** `${design.figma}` ≠ `none` → run the
     **`implement-designs`** skill (its Explorer/Analyzer/Coder/Reviewer council), passing the
     Architecture Brief as binding input alongside the design links and AC.
   - Otherwise → run the **`implement`** command flow's Team Dispatch: **Cody** (`coder`)
     implements from the Team Briefing (Harvey's AC + Archie's brief + the command's guidelines
     as the implementation standard); **Tess** (`tester`) runs affected suites; the review panel
     — **Cleo** (`clean-code-reviewer`), **Rex** (`architecture-reviewer`, brief in hand),
     **Tia** (`test-integrity-reviewer`) — votes independently and must be unanimous; **Sol**
     (`resolver`) consolidates any concerns, then Tess + panel re-run. When
     `${integrations.superpowers}` is set, fan the seats out per
     `superpowers:dispatching-parallel-agents` (see `skills/shared/superpowers-integration.md`).
8. **Finish line** (`skills/shared/finish-line.md`): green gate per
   `skills/shared/green-gate.md` (full unit + full E2E suites, or the scaffold offer — never a
   silent skip), commit, push, open PR → `${vcs.integrationBranch}`, enable auto-merge
   (`gh pr merge --auto --squash`) if supported. Never force-merge or override protection. Stop.

## Gaps

- Genuine implementation blocker that is the story's own scope (ambiguous AC discovered
  mid-flight, missing dependency owned by another team) → **park** (`<KEY> # <one-line>`), revert
  to a clean tree, transition the issue back to `${states.todo}`, stop.
- **Transient — do NOT park, retried next tick:** env/infra failure described in
  `${recoveryNotes}` → follow that runbook. **Never park a story for an env/infra reason.**
- Leave the working tree clean (back on `origin/${vcs.integrationBranch}`) when done.

## Start / Stop / Adjust

- **Stop:** `stop-loop-stack`, or `CronDelete <id>` (`CronList` for ids), or close the session.
- **Re-register:** re-run `launch-loop-stack`.
- **Cadence:** edit the minute field (`1,21,41` → e.g. `1,31`). **Window:** edit the hour field (`6-20`).
- **Survive restarts:** register with `durable: true`. **Survive a closed terminal:** cloud `/schedule`.

## Caveats

- This loop makes real changes **unattended**: it transitions the tracker, writes feature code,
  and opens + auto-merges green PRs into `${vcs.integrationBranch}`. It gates strictly on the
  green gate and never overrides branch protection. Review its output.
- A single implementation run usually exceeds 20 min; overlap guards + idle-gating keep it to one
  at a time.

## Related

- `launch-loop-stack` / `stop-loop-stack` — register/tear down all loops.
- `commands/implement.md` — the Team Dispatch flow Phase I runs. `implement-designs` — the design path.
- `agents/architect.md` — Archie's Architecture Brief contract.
- `.claude/loops/my-bugs-in-sprint-devfix.md` — FIX/VERIFY/STORY-VERIFY (STORY-VERIFY verifies this loop's output).
