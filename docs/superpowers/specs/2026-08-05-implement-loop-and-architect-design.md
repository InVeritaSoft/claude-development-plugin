# IMPLEMENT loop + architect agent — design

**Date:** 2026-08-05
**Status:** approved in session, pending spec review

## Problem

The loop-stack drives bugs autonomously (FIX → devfix → STORY-VERIFY/VERIFY) and tests
continuously (E2E-SWEEP), but stories/features still require a human to invoke the `implement`
or `implement-designs` command. And while architecture is *reviewed* after the fact
(`architecture-reviewer` seat, `principal-architect` lens), nothing *designs* upfront: the coder
starts from raw AC with no binding architectural plan.

This adds the two missing roles: an **implementer** (a new IMPLEMENT loop that picks up sprint
stories autonomously) and an **architect** (a new agent whose briefing is a mandatory
pre-implementation phase).

**Non-goals:** no new orchestration team (the `implement` / `implement-designs` skills already
carry their own agent councils); no ARCH-SWEEP audit loop; no change to the bug path (devfix) or
to STORY-VERIFY.

## 1. IMPLEMENT loop — `loops/implement.md`

A session cron loop mirroring FIX, operating on stories/tasks instead of bugs. Config-driven per
`CONVENTIONS.md`; `.claude/stack.md` missing → run `onboard` and stop.

- **Cadence:** `1,21,41 6-20 * * 1-5` — every 20 min in the FIX weekday window, staggered into
  the free `:01/:21/:41` minute slot (FIX owns `:00 mod 5`, STORY-VERIFY `:02`, VERIFY `:03`,
  DEPLOY-FIX `:04 mod 10`, PR-SHEPHERD `:06 mod 10`, E2E-SWEEP `:11/:31/:51`). 20 min because a
  story implementation is heavier than a bugfix; overlap guard + idle-gating serialize as usual.
- **Selection:** `${issueTracker.myWorkQuery}` filtered to
  `issuetype in ${issueTracker.issueTypes.implement}` in `${states.todo}`. User-scoped + active
  iteration — same scoping invariant as FIX, never the whole backlog. Skip registration entirely
  if `${issueTracker.issueTypes.implement}` is `none`/empty.
- **New config key — `${issueTracker.issueTypes.implement}`:** the list of issue types the
  IMPLEMENT loop is allowed to pick up (e.g. `[Story, Task]`), set by **onboarding** (§3a).
  Distinct from `issueTypes.bug` (FIX's scope) and from `issueTypes.story` (STORY-VERIFY's
  scope) — a team may want the loop implementing Tasks but not Stories, or vice versa.
- **One action per tick**, session-only, auto-expire 7 days — same contract as every loop.

### Tick structure

**Step 1 — reconcile prior IMPLEMENT work** (identical shape to FIX Step 1): find a loop-created
PR (head per `${vcs.branchNaming}`, base `${vcs.integrationBranch}`, mine) for a story now
`${states.inProgress}`:

- **Merged** → transition story → `${states.verify}` so the existing **STORY-VERIFY** loop takes
  over (its E2E-mandatory AC gate already exists — no new verify machinery). Stop.
- **Open + all checks green** → merge per `${vcs.autoMerge}`; on success → `${states.verify}`.
  Never override branch protection. Stop.
- **Open + pending checks** → stop (retry next tick).
- **Open + failing check** → leave for **PR-SHEPHERD**. Stop.
- Superpowers present → drive the merge/handoff via
  `superpowers:finishing-a-development-branch` (see `skills/shared/superpowers-integration.md`).

**Step 2 — start a new story** (only if no in-flight loop PR, overlap guard clean):

1. Pick one story (priority DESC, lowest key). Transition `${states.todo}` →
   `${states.inProgress}` **before working**.
2. Branch per `${vcs.branchNaming}` (default type `feat`) off latest
   `origin/${vcs.integrationBranch}`.
3. **Phase H — Harvest (mandatory).** Dispatch the issue harvester agent
   (`agents/jira-harvester.md`) for the full context: description, comments, subtask/parent,
   Epic chain, related issues, linked docs pages, design links → structured AC YAML.
4. **Phase B — Brief (mandatory).** Dispatch the **architect** agent (§2) with the harvest
   output. It returns the Architecture Brief. Verdict `needs-decomposition` → **park** (append
   `<KEY> # <reason>` to `.claude/loops/state/my-stories-implement-parked.txt`), revert the
   story to `${states.todo}`, delete the branch, stop.
5. **Phase I — Implement, as a small subagent team.** Route by design presence:
   - Harvest surfaced design links **and** `${design.figma}` ≠ `none` → run the
     **`implement-designs`** skill — it already orchestrates its
     Explorer/Analyzer/Coder/Reviewer council; the Architecture Brief joins its inputs.
   - Otherwise → dispatch the **existing agent roster as a small team**, mirroring devfix
     Phases 2–3.6 (no new agents beyond the architect): **coder** implements from a Team
     Briefing = harvester AC + Architecture Brief + the `implement` command's guidelines as
     its implementation standard; **tester** runs affected suites; the **review panel**
     (clean-code-reviewer, architecture-reviewer — brief in hand, test-integrity-reviewer)
     returns independent verdicts; **resolver** consolidates concerns, then tester + panel
     re-run until unanimous. Parallelize independent seats per
     `superpowers:dispatching-parallel-agents` when available.
   The Architecture Brief is binding input either way.
6. **Finish-line** (`skills/shared/finish-line.md`): green gate, PR → `${vcs.integrationBranch}`,
   enable auto-merge when supported. Stop.

**Park file:** `.claude/loops/state/my-stories-implement-parked.txt`. Parked = needs a human
(decomposition, ambiguous AC, missing design). Escalated by DAILY-REPORT; clear the file to
un-park.

## 2. Architect agent — `agents/architect.md`

Read-only (tools: Bash, Read) — the *proactive* counterpart to the review-seat
`architecture-reviewer`. It designs before code exists; the reviewer later checks the diff
against this design. Applies the `principal-architect` rubric (Clean Architecture dependency
direction, port/adapter boundaries, compliance regime, policy coverage, coupling) *forward*.

**Consumes:** the harvester's AC YAML (+ repo access for structure reconnaissance; it may reuse
`context-scout`-style dependency inspection but stays read-only).

**Produces — the Architecture Brief (YAML):**

- `scope_verdict:` `fits-one-pr` | `needs-decomposition` (with reason — this is the park trigger)
- `contexts_and_layers:` bounded contexts + layers touched (domain / application /
  infrastructure / presentation)
- `dependency_constraints:` import-direction rules the diff must respect
- `contracts:` ports/adapters/services to add or extend; shared validation schemas by domain
- `reuse:` existing components/services/hooks to reuse vs create — for UI, defer to
  `lego-philosophy` and the `designer` agent's Component Map rather than restating them
- `data:` schema/migration needs — when present, flag the `database-migration` skill (approval
  guardrail applies)
- `compliance:` sensitive-data touchpoints → encryption + audit-middleware obligations
- `risks:` cross-cutting risk flags for the reviewers

**Binding contract:** the implementing council must follow the brief; deviation requires the
brief to be revised, not silently ignored. `architecture-reviewer` (Seat B) receives the brief
and verifies the diff against it.

## 2a. Cozy names — the implement team's personas

Every team member gets a cozy display name, used in loop narration, the Team Briefing, PR/tracker
comments, and DAILY-REPORT lines — so a tick reads like a small team at work ("Archie parked
PROJ-42: needs decomposition"). **Agent ids and filenames stay technical kebab-case** (that's what
dispatch and the tests key on); the cozy name lives in each agent's frontmatter as a persona line.

| Agent (id) | Cozy name |
|---|---|
| `jira-harvester` | **Harvey** — brings back the whole story, never a summary |
| `architect` (new) | **Archie** — draws the blueprint before anyone lifts a brick |
| `coder` | **Cody** — builds exactly what the blueprint says |
| `tester` | **Tess** — trusts nothing until it's green |
| `clean-code-reviewer` | **Cleo** — tidies to SOLID/DRY/KISS |
| `architecture-reviewer` | **Rex** — checks the build against Archie's blueprint |
| `test-integrity-reviewer` | **Tia** — no weakened assertions on her watch |
| `resolver` | **Sol** — turns the panel's concerns into one clean pass |
| `designer` | **Dezi** — maps pixels to components (design path only) |

Scope note: personas are additive flavor — one frontmatter line + narration usage. No behavior,
tool grants, or dispatch contracts change because of a name.

## 3a. Onboarding — which task types to implement

`onboard` clarifies which issue types the IMPLEMENT loop may pick up and writes the answer to
`.claude/stack.md` / `stack.json` as `issueTracker.issueTypes.implement`:

- **Interactive:** after detecting the tracker, ask "Which issue types should the autonomous
  IMPLEMENT loop pick up?" offering the tracker's non-bug types (per the `TRACKER` presets —
  e.g. Jira: Story/Task/Improvement; GitHub Issues: labels; Linear: non-bug issue types), with a
  none-of-them option that disables the loop.
- **Non-interactive / `--detect-only`:** default to the tracker preset's story+task types;
  `--detect-only` prints the value without writing, like every other detected field.
- Files touched: `onboard.mjs` (prompt + preset defaults + rendering into both stack files),
  `skills/onboard/stack.example.md`, `CONVENTIONS.md` token map (and its tracker-adaptive
  table), `tests/onboard.test.mjs` (assert the key is rendered in interactive-default and
  non-interactive runs, and that presets provide a sane default per tracker).
- `onboard.mjs` stays dependency-free and fail-soft — the new question follows the existing
  prompt machinery, no new imports.

## 3. Wiring changes (existing files)

| File | Change |
|---|---|
| `commands/implement.md` | Insert mandatory **Harvest → Brief** phases before Step 1 (issue key/URL → harvester then architect; no key → architect briefs from the provided spec), and a short **Team Dispatch** section: non-trivial implementations run the small-team flow of §1 Phase I (coder/tester/review-panel/resolver) with these guidelines as the coder's standard, rather than single-threaded inline work. |
| `skills/implement-designs/SKILL.md` | One line: accept an Architecture Brief as input; its Analyzer honors it. |
| `skills/launch-loop-stack/SKILL.md` | Register the IMPLEMENT cron (Loop 10), roster table + description; skip when `${issueTracker.issueTypes.implement}` is `none`/empty. |
| `skills/onboard/*` + `CONVENTIONS.md` + `tests/onboard.test.mjs` | The `issueTypes.implement` onboarding question, presets, rendering, token-map entry, and test assertions (§3a). |
| `skills/stop-loop-stack/SKILL.md` | Add IMPLEMENT to the teardown roster + the parked-file note. |
| `loops/daily-report.md` | Add `my-stories-implement-parked.txt` to the parked-item escalation sweep. |
| `MANIFEST.md` | Loop roster table (10 loops), layout counts (agents 14, loops 8 files). |
| `.claude-plugin/plugin.json` + root `marketplace.json` (+ README/docs citing versions or the loop roster) | Version bump, kept in sync — the three-places rule. |

`onboard.mjs` materializes `loops/*.md` by directory listing, so the new loop file flows into
`.claude/loops/` with no script change (verify in implementation; add a test assertion if the
list is explicit anywhere).

## Error handling

- Tracker/transition failures mid-tick: same convention as FIX — stop, next tick reconciles.
- Architect parks rather than guesses: ambiguous AC, epic-sized scope, missing design when the
  story is UI-shaped.
- Env/infra failures follow `${recoveryNotes}`; never park a story for an infra reason.
- Every capability set to `none` in config is skipped, except testing (green-gate contract).

## Testing

This repo's suite is invariant-based (`tests/`): the new files are covered automatically by the
existing checks (every manifest valid, versions in sync, shared references resolve, no raw NUL).
Add targeted assertions only if `tests/` enumerates agents/loops explicitly. Run
`node --test tests/*.test.mjs` before committing — that is what CI gates on.
