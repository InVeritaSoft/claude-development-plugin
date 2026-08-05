# Loop: daily report → what the stack did, what's blocked, what needs a human

A session-scoped cron that fires **once per weekday at end of day** and posts a short standup-style
summary of everything the loop stack did in the last 24 hours — and, critically, everything it
**parked**. The other loops park silently into files under `.claude/loops/state/`; without this loop, "parked =
needs a human" never actually reaches one. **Read-only + one notification: this loop never changes
code, PRs, branches, or tracker state.** You own this file — edit it, then re-register.

> **Config-driven.** Read `.claude/stack.md` first. Repo/handle from `${project.*}`, tracker from
> `${issueTracker.*}`, destination from `${reporting.*}`. If `${reporting.destination}` is `none`
> or unset, deliver via push notification only. If `.claude/stack.md` is missing, run `onboard`
> and stop.

## Schedule

| Setting | Value |
|---|---|
| Cadence | once per weekday (`59 16 * * 1-5` — 16:59, a free minute across the stack's staggered crons) |
| When | end of the working day; edit the hour/minute to taste |
| Persistence | **session-only** (`durable: false`) — dies when the session exits |
| Auto-expiry | recurring cron auto-expires after **7 days** |

## What each tick does

1. **Gather the last 24h**, all read-only:
   - **Merged:** `gh pr list --state merged --author "@me" --search "merged:>=<24h-ago ISO date>"` in `${project.repo}`.
   - **In flight:** my open PRs with their state — checks green/red/pending, `reviewDecision`, `mergeable` (`gh pr list --state open --author "@me" --json ...`).
   - **Verified / handed off:** tracker issues I transitioned in the last 24h (via `${issueTracker.myWorkQuery}` + each issue's changelog, or my comments posted in the window).
   - **Reviews posted:** entries in `.claude/loops/state/pr-review-done.txt` (compare against yesterday if a snapshot exists; otherwise report the file's PRs still open).
   - **Deploy incidents:** entries in `.claude/loops/state/deploy-fix-done.txt` from the window (`# fixed via PR` vs `# infra`).
   - **Suite health:** the Coverage + Confirmed regressions sections of `.claude/loops/state/e2e-sweep-report.md` — condensed to one line (scenarios swept in the last 24h, confirmed e2e regressions).
   - **PARKED — the part that must not rot:** every line of `.claude/loops/state/my-bugs-verify-parked.txt`,
     `.claude/loops/state/my-stories-verify-parked.txt`, `.claude/loops/state/my-stories-implement-parked.txt` (stories the IMPLEMENT loop parked for a human — needs-decomposition or ambiguous AC), every `# needs-human` line in `.claude/loops/state/pr-shepherd-done.txt`, every line of `.claude/loops/state/sync-integration-blocked.txt` (fix-base branches a human must promote by hand), and every line of `.claude/loops/state/e2e-sweep-blocked.txt` (sweeps skipped because the app wasn't up).
2. **Compose** a short, human-voice summary (plain sentences, no jargon-dump):
   - **Done** — merged PRs, issues verified/handed to QA.
   - **In flight** — open PRs and what each is waiting on (review / checks / conflict).
   - **Blocked / parked** — each parked item with its one-line reason. This section is the loop's reason to exist.
   - **Incidents** — deploy failures handled or reported as infra.
   - **Suite health** — one line from the e2e sweep: coverage + confirmed regressions.
3. **Deliver:**
   - `${reporting.destination}` set (e.g. a tracker page / issue comment / channel) → post the summary there.
   - **Always** also send a `PushNotification` with the one-line headline, e.g.
     `"3 merged, 2 verified, 1 parked (RESC-1234: no AC coverage)"`.
4. **Quiet-day rule:** if nothing happened in the window **and** nothing is parked → send nothing.
   If parked items exist, ALWAYS report — parked items repeat in every report until a human clears them.

**Read-only + one notification per day. Never edits anything. Session-only.**

## Start / Stop / Adjust

- **Stop:** `stop-loop-stack`, or `CronDelete <id>` (`CronList` for ids), or close the session.
- **Re-register** (after editing this file / new session): re-run `launch-loop-stack`.
- **Time:** edit the cron (`59 16 * * 1-5` → your end-of-day). Twice daily: add a morning entry, e.g. `59 8,16 * * 1-5`.
- **Survive restarts:** register with `durable: true`. **Survive a closed terminal:** use a cloud `/schedule`.

## Related

- `.claude/loops/my-bugs-in-sprint-devfix.md` — writes the park files this loop surfaces.
- `.claude/loops/implement.md` — writes the implement park file this loop surfaces.
- `.claude/loops/pr-shepherd.md` — writes the `# needs-human` entries this loop surfaces.
- `.claude/loops/deploy-failure-fix.md`, `.claude/loops/pr-review.md` — activity sources.
- `.claude/loops/e2e-sweep.md` — writes the rolling suite-health report and the blocked lines this loop condenses.
