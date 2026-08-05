# IMPLEMENT Loop + Architect Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an autonomous IMPLEMENT cron loop (sprint stories → harvest → architect brief → small-team implementation → PR) and a read-only `architect` agent whose Architecture Brief is a mandatory, binding pre-implementation phase; onboarding captures which issue types the loop may pick up.

**Architecture:** This repo ships Markdown instruction files (skills/agents/commands/loops) plus one zero-dependency Node script (`onboard.mjs`). The only *code* change is a new `issueTracker.issueTypes.implement` config key in `onboard.mjs` (TDD, driven by `tests/onboard.test.mjs`). Everything else is prose-contract files following the config-first contract in `plugins/loop-stack/CONVENTIONS.md`. Spec: `docs/superpowers/specs/2026-08-05-implement-loop-and-architect-design.md`.

**Tech Stack:** Node built-ins only (`node:test`, `node:assert`), Markdown, JSON manifests.

## Global Constraints

- Repo root: `/Users/mykhailoshevchenko/Documents/lolibai/claude-development-plugin`. All paths below are repo-relative.
- `onboard.mjs` stays **dependency-free** (Node built-ins only) and **fail-soft** (a missing CLI never crashes; `tests/onboard.test.mjs` runs it with `PATH=""`).
- Never embed a raw control character (esp. NUL) in any source file — `tests/manifests.test.mjs` enforces this.
- Every new/edited skill/agent/command/loop file keeps the config-first contract near the top: *"Read `.claude/stack.md` first. Use its values; never assume a specific tool. If a needed capability is `none`, skip those steps. If the config is missing, run the `onboard` skill and stop."* (Testing is the one exception — green-gate.)
- Every `skills/shared/*.md` path you mention must point at a file that exists (`tests/manifests.test.mjs` checks all references).
- Versions must stay in sync in THREE places: `plugins/loop-stack/.claude-plugin/plugin.json`, the loop-stack entry in `.claude-plugin/marketplace.json`, and any docs citing the version (README.md line "Current versions: **loop-stack 1.5.0**"). This plan bumps loop-stack **1.5.0 → 1.6.0**.
- Test command (what CI gates on): `node --test tests/*.test.mjs` — run from repo root. Full suite must be green before each commit.
- Cozy names (display-only; ids/filenames stay kebab-case): jira-harvester=**Harvey**, architect=**Archie**, coder=**Cody**, tester=**Tess**, clean-code-reviewer=**Cleo**, architecture-reviewer=**Rex**, test-integrity-reviewer=**Tia**, resolver=**Sol**, designer=**Dezi**.
- The IMPLEMENT cron is `1,21,41 6-20 * * 1-5` (free stagger slot; do not change it in one file without changing all files that cite it: `loops/implement.md`, `skills/launch-loop-stack/SKILL.md`, `MANIFEST.md`).
- Park file name used everywhere: `.claude/loops/state/my-stories-implement-parked.txt`.
- This is a healthcare-adjacent environment: any example data in tests/docs must be synthetic (fixture projects already are).

---

### Task 1: `issueTracker.issueTypes.implement` in onboard.mjs (TDD)

**Files:**
- Modify: `plugins/loop-stack/skills/onboard/onboard.mjs` (TRACKER presets ~line 327, `defaultsFrom` ~line 368, `prompt` ~line 444, `renderMd` ~line 494)
- Test: `tests/onboard.test.mjs`

**Interfaces:**
- Consumes: existing `TRACKER` preset object, `defaultsFrom(d, prev)`, `renderMd(c)`.
- Produces: `cfg.issueTracker.issueTypes.implement` — **array of strings** (may be `[]` = loop disabled) in `stack.json`; a rendered line in `stack.md`'s `## Issue tracker` section matching `/IMPLEMENT loop picks up:/`. Later tasks (loop spec, launch skill) reference the token `${issueTracker.issueTypes.implement}`.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe("onboard --non-interactive", ...)` block in `tests/onboard.test.mjs` (before its closing `});`):

```js
  // The IMPLEMENT loop only picks up issue types the project opted into at onboarding.
  // The key must exist with a tracker-preset default, render into stack.md (what loops read),
  // survive re-runs, and support [] = "loop disabled" without being re-seeded.
  test("seeds issueTypes.implement from the tracker preset and renders it", () => {
    const dir = tmpProject({ "package.json": pkg() });
    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });

    const cfg = readJSON(dir, ".claude/stack.json");
    assert.deepEqual(cfg.issueTracker.issueTypes.implement, ["story", "task"]);

    const tracker = stackMdSection(read(dir, ".claude/stack.md"), "## Issue tracker");
    assert.match(tracker, /IMPLEMENT loop picks up:/);
    assert.match(tracker, /story/);
  });

  test("preserves customized issueTypes.implement across re-runs, including []", () => {
    const dir = tmpProject({ "package.json": pkg() });
    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });

    const cfg = readJSON(dir, ".claude/stack.json");
    cfg.issueTracker.issueTypes.implement = ["Improvement"];
    fs.writeFileSync(path.join(dir, ".claude/stack.json"), JSON.stringify(cfg, null, 2));
    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });
    assert.deepEqual(readJSON(dir, ".claude/stack.json").issueTracker.issueTypes.implement, ["Improvement"]);

    cfg.issueTracker.issueTypes.implement = [];
    fs.writeFileSync(path.join(dir, ".claude/stack.json"), JSON.stringify(cfg, null, 2));
    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });
    assert.deepEqual(readJSON(dir, ".claude/stack.json").issueTracker.issueTypes.implement, [],
      "[] means 'IMPLEMENT loop disabled' and must not be re-seeded");
    assert.match(stackMdSection(read(dir, ".claude/stack.md"), "## Issue tracker"),
      /IMPLEMENT loop picks up: none/);
  });
```

Note: the fixture has no git remote, so `detectVcs()` falls back to host `"github"` and `defaultsFrom` picks the `github` tracker preset — hence the expected default `["story", "task"]` (label-style lowercase, matching the github preset's label-style states).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/onboard.test.mjs`
Expected: the two new tests FAIL (`implement` is `undefined`, `deepEqual` mismatch); all pre-existing tests still PASS.

- [ ] **Step 3: Implement in onboard.mjs**

Three edits:

(a) In the `TRACKER` presets (~line 327), add an `implementTypes` entry to each tracker:

```js
  jira: {
    keyPrefix: "",
    myWorkQuery: "assignee = currentUser() AND sprint in openSprints()",
    states: { todo: "To Do", inProgress: "In Progress", inReview: "In Review", verify: "Dev Testing", verified: "Ready for Testing", done: "Done" },
    handoff: "reporter",
    implementTypes: ["Story", "Task"],
  },
```

For `github` add `implementTypes: ["story", "task"],` (issue types are labels there) and for `linear` add `implementTypes: ["Feature", "Improvement"],` — same position in each preset, after `handoff`.

(b) In `defaultsFrom` (~line 368), replace the line

```js
      issueTypes: it.issueTypes || { bug: "Bug", story: "Story" },
```

with (per-key merge so a prev config that predates `implement` gets seeded, but a present value — including `[]` — is preserved; `[]` is truthy in JS so `||` keeps it):

```js
      issueTypes: {
        bug: (it.issueTypes && it.issueTypes.bug) || "Bug",
        story: (it.issueTypes && it.issueTypes.story) || "Story",
        // Which issue types the autonomous IMPLEMENT loop may pick up. [] = loop disabled.
        implement: (it.issueTypes && it.issueTypes.implement) || tp.implementTypes || ["Story", "Task"],
      },
```

(c) In `prompt()` (~line 444), directly after the `} else if (tool !== "none") { ... }` chain closes (after the line asking `'My active work' query`, before `cfg.vcs.integrationBranch = ...`), add:

```js
  if (tool !== "none") {
    const implAns = await ask("Issue types the autonomous IMPLEMENT loop may pick up (comma-sep; 'none' disables it)", (cfg.issueTracker.issueTypes.implement || []).join(",") || "none");
    cfg.issueTracker.issueTypes.implement = /^none$/i.test(implAns) ? [] : implAns.split(",").map((s) => s.trim()).filter(Boolean);
  }
```

(d) In `renderMd` (~line 494), replace the line

```js
  L.push("- Issue types: bug=" + code(c.issueTracker.issueTypes.bug) + ", story=" + code(c.issueTracker.issueTypes.story));
```

with:

```js
  {
    const impl = c.issueTracker.issueTypes.implement || [];
    L.push("- Issue types: bug=" + code(c.issueTracker.issueTypes.bug) + ", story=" + code(c.issueTracker.issueTypes.story));
    L.push("- IMPLEMENT loop picks up: " + (impl.length ? impl.map(code).join(", ") : "none " + DASH + " IMPLEMENT loop disabled"));
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/onboard.test.mjs`
Expected: ALL tests PASS (including the fail-soft `PATH=""` test — the change uses no new imports or CLIs).

- [ ] **Step 5: Run the full suite and commit**

Run: `node --test tests/*.test.mjs` — expected all green.

```bash
git add plugins/loop-stack/skills/onboard/onboard.mjs tests/onboard.test.mjs
git commit -m "feat(onboard): capture which issue types the IMPLEMENT loop may pick up"
```

---

### Task 2: `agents/architect.md` — Archie, the upfront design agent

**Files:**
- Create: `plugins/loop-stack/agents/architect.md`

**Interfaces:**
- Consumes: `issue_harvester` output YAML (from `agents/jira-harvester.md` — fields `ticket.description_ac`, `ticket.gherkin_blocks`, `epic`, `related_issues`, design links).
- Produces: `architect:` **Architecture Brief YAML** with top-level fields `scope_verdict` (`fits-one-pr | needs-decomposition`), `contexts_and_layers`, `dependency_constraints`, `contracts`, `reuse`, `data`, `compliance`, `risks` — consumed by the IMPLEMENT loop (Task 4), the `implement` command (Task 8), `implement-designs` (Task 9), and checked by `architecture-reviewer` (Rex).

- [ ] **Step 1: Create the file with exactly this content**

````markdown
---
name: architect
description: Upfront design agent (persona "Archie") that runs BEFORE any implementation in the IMPLEMENT loop and the implement command — reads the harvested AC, surveys the repo read-only, and produces a binding Architecture Brief (scope verdict, layers, contracts, reuse, data/migration needs, compliance notes, risks). The proactive counterpart to architecture-reviewer, which later verifies the diff against this brief. Read-only, never edits.
model: fable
context: fork
tools:
  - Bash
  - Read
---

# Architect — Archie

> Persona: **Archie** — draws the blueprint before anyone lifts a brick. (Cozy display name for
> narration, briefings, and reports; the agent id stays `architect`.)

Designs before code exists. Consumes the issue harvester's AC and returns an **Architecture Brief**
that is **binding** on the implementing team: the coder follows it, and the review panel's
`architecture-reviewer` seat (Rex) verifies the finished diff against it. Deviating from the brief
requires revising the brief, never silently ignoring it. Applies the `principal-architect` rubric
*forward* (design time), not backward (review time). Never edits files.

> **Read `.claude/stack.md` first; use its values; never assume a specific tool.** Architecture
> layers and the data platform come from `${backend.platform}`, the compliance regime from
> `${compliance}`, frontend conventions from `${frontend.*}`, the design tool from `${design.figma}`.
> If a needed capability is `none`, skip that sub-section of the brief (e.g. no compliance regime →
> `compliance: none`; no backend platform → `data: none`). If the config is missing, run the
> `onboard` skill and stop.

## Input (from parent)

```yaml
issue_harvester_output: {...}   # consolidated AC, Gherkin blocks, Epic chain, related issues, design links
user_prompt: "..."              # verbatim, when the caller had one (manual implement runs)
```

When there is no harvester output (manual `implement` run without an issue key), brief from the
spec/requirements the caller provides instead — the output contract is identical.

## Execution steps

### 1. Scope verdict first

Judge whether the AC fits ONE reviewable PR implemented by one small team pass:
- **`needs-decomposition`** when the AC spans multiple independent subsystems, is epic-sized,
  contradicts itself, or (for UI-shaped work) has no design and no textual spec to build from.
  Give a one-line reason plus a suggested split. The caller parks the issue for a human — do not
  design further.
- **`fits-one-pr`** otherwise → produce the full brief.

### 2. Survey the territory (read-only)

Locate the code the AC touches: entry points, the bounded context(s), the layers involved
(domain / application / infrastructure / presentation), existing services/ports/adapters, shared
components and validation schemas. Use the code graph if available (`graphify query`), else
targeted search. Read enough to name real files and symbols — a brief that says "somewhere in the
backend" is a failed brief.

### 3. Draw the blueprint

Decide and record, per the output contract below:
- which layers/contexts change and the dependency direction the diff must respect
  (`domain ← application ← infrastructure ← presentation`; services via the project's
  service-access convention, e.g. an injected `ctx.services.*` container);
- contracts to add or extend (ports, adapters, services, routers/procedures, shared validation
  schemas by domain);
- what to REUSE vs CREATE — name the existing service/component/hook when reuse applies. For UI
  composition defer to the `lego-philosophy` skill and the designer agent's (Dezi's) Component
  Map: the brief marks *that* a component decision exists, not pixel details;
- data-model/migration needs — when the AC needs schema change, flag the `database-migration`
  skill (its "never apply without explicit approval" guardrail applies) and name tables/columns;
- compliance touchpoints (only if `${compliance}` ≠ none): sensitive data handled → encryption at
  rest + audit-middleware + non-enumerating errors obligations, stated per endpoint;
- risks for the reviewers: coupling hot-spots, migration ordering, backward compatibility,
  anything Rex/Cleo/Tia should look at twice.

### 4. Self-check before returning

- [ ] Verdict justified in one line
- [ ] Every named file/symbol actually exists (you read it), or is explicitly marked NEW
- [ ] No implementation detail beyond what constrains the coder (YAGNI — a brief, not a diff)
- [ ] Config honored: `none` capabilities produced `none` sections, not invented steps

## Output YAML

```yaml
architect:
  persona: Archie
  scope_verdict: fits-one-pr | needs-decomposition
  verdict_reason: "..."             # one line; for needs-decomposition include a suggested split
  contexts_and_layers:
    - context: "..."                # bounded context / module
      layers: [domain, application, infrastructure, presentation]   # subset actually touched
      key_files: []                 # existing files read; NEW files marked "NEW: path"
  dependency_constraints:
    - "..."                         # e.g. "domain/<ctx> must not import from infrastructure/*"
  contracts:
    - kind: port | adapter | service | router | schema
      name: "..."
      action: create | extend
      note: "..."
  reuse:
    - use: "..."                    # existing symbol/component to reuse
      instead_of: "..."             # what NOT to create
  data: none | ...                  # migration needs; flags database-migration when present
  compliance: none | ...            # per-endpoint obligations when ${compliance} ≠ none
  risks: []                         # reviewer-focus flags
```
````

- [ ] **Step 2: Run the invariant suite**

Run: `node --test tests/*.test.mjs`
Expected: PASS (manifest checks parse the new file; the `principal-architect`, `lego-philosophy`, `database-migration` skills and the `shared` references it names all exist).

- [ ] **Step 3: Commit**

```bash
git add plugins/loop-stack/agents/architect.md
git commit -m "feat(agents): add architect (Archie) — binding pre-implementation Architecture Brief"
```

---

### Task 3: Cozy persona lines in the eight existing agents

**Files:**
- Modify: `plugins/loop-stack/agents/jira-harvester.md`, `coder.md`, `tester.md`, `clean-code-reviewer.md`, `architecture-reviewer.md`, `test-integrity-reviewer.md`, `resolver.md`, `designer.md`

**Interfaces:**
- Produces: a persona blockquote in each agent, referenced by narration in Tasks 4, 5, 8. No behavior, tool grants, or dispatch contracts change.

- [ ] **Step 1: Add one persona blockquote per file**

Directly under each file's H1 title line (e.g. under `# Coder`), insert a blank line then the matching line below. Format is identical to the Archie line in Task 2 — copy the pattern exactly, substituting name/id/tagline:

- `jira-harvester.md` (H1 `# Issue Harvester`): `> Persona: **Harvey** — brings back the whole story, never a summary. (Cozy display name for narration, briefings, and reports; the agent id stays \`jira-harvester\`.)`
- `coder.md` (`# Coder`): `> Persona: **Cody** — builds exactly what the blueprint says. (Cozy display name for narration, briefings, and reports; the agent id stays \`coder\`.)`
- `tester.md` (find the H1): `> Persona: **Tess** — trusts nothing until it's green. (…id stays \`tester\`.)` — write the parenthetical in full, same wording as the others.
- `clean-code-reviewer.md`: `> Persona: **Cleo** — tidies to SOLID/DRY/KISS. (…id stays \`clean-code-reviewer\`.)` — full parenthetical.
- `architecture-reviewer.md` (`# Architecture & Compliance Reviewer — Review Panel Seat B`): `> Persona: **Rex** — checks the build against Archie's blueprint. (…id stays \`architecture-reviewer\`.)` — full parenthetical.
- `test-integrity-reviewer.md`: `> Persona: **Tia** — no weakened assertions on her watch. (…id stays \`test-integrity-reviewer\`.)` — full parenthetical.
- `resolver.md`: `> Persona: **Sol** — turns the panel's concerns into one clean pass. (…id stays \`resolver\`.)` — full parenthetical.
- `designer.md`: `> Persona: **Dezi** — maps pixels to components. (…id stays \`designer\`.)` — full parenthetical.

- [ ] **Step 2: Verify and commit**

Run: `node --test tests/*.test.mjs` — expected PASS.

```bash
git add plugins/loop-stack/agents/
git commit -m "feat(agents): cozy persona names for the implement team (frontmatter-adjacent, display-only)"
```

---

### Task 4: `loops/implement.md` — the IMPLEMENT loop spec

**Files:**
- Create: `plugins/loop-stack/loops/implement.md`

**Interfaces:**
- Consumes: `${issueTracker.issueTypes.implement}` (Task 1), `agents/architect.md` (Task 2), existing `jira-harvester`, `implement-designs`, `commands/implement.md`, `skills/shared/finish-line.md`, `skills/shared/green-gate.md`.
- Produces: the spec file the cron prompt references as `.claude/loops/implement.md`; park file `.claude/loops/state/my-stories-implement-parked.txt` (read by Tasks 6, 7). `onboard.mjs` materializes it automatically (it copies `loops/*.md` by directory listing — no script change; the existing test asserts `specs.length >= 6`, which 8 satisfies).

- [ ] **Step 1: Create the file with exactly this content**

````markdown
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
````

- [ ] **Step 2: Verify and commit**

Run: `node --test tests/*.test.mjs` — expected PASS (shared refs `finish-line.md`, `green-gate.md`, `superpowers-integration.md` all exist).

```bash
git add plugins/loop-stack/loops/implement.md
git commit -m "feat(loops): IMPLEMENT loop — harvest, architect brief, small-team implementation, PR"
```

---

### Task 5: Register IMPLEMENT in `launch-loop-stack`

**Files:**
- Modify: `plugins/loop-stack/skills/launch-loop-stack/SKILL.md`

**Interfaces:**
- Consumes: cron `1,21,41 6-20 * * 1-5`, spec path `.claude/loops/implement.md`, `${issueTracker.issueTypes.implement}` (Task 1), agent personas (Tasks 2–3).
- Produces: the registered cron prompt whose first line contains the literal signature `— IMPLEMENT TICK` (Task 6 matches on it).

- [ ] **Step 1: Update the frontmatter description**

In line 3, change `— the FIX, VERIFY, STORY-VERIFY, PR-REVIEW, DEPLOY-FIX, PR-SHEPHERD, SYNC-INTEGRATION, E2E-SWEEP, and DAILY-REPORT recurring ticks —` to `— the FIX, IMPLEMENT, VERIFY, STORY-VERIFY, PR-REVIEW, DEPLOY-FIX, PR-SHEPHERD, SYNC-INTEGRATION, E2E-SWEEP, and DAILY-REPORT recurring ticks —`.

- [ ] **Step 2: Add the skip rule**

In the config blockquote (lines 15–20), after the line `> skip E2E-SWEEP when ${testing.e2e.runner} is none.` add:

```
> Skip IMPLEMENT when `${issueTracker.issueTypes.implement}` is empty/`none` (the project opted out of autonomous story implementation at onboarding).
```

- [ ] **Step 3: Add the roster row**

In the cadence table (after the **FIX** row, line 24), insert:

```
| **IMPLEMENT** | weekdays 06:01–20:41, every 20 min at :01/:21/:41 | `1,21,41 6-20 * * 1-5` | `.claude/loops/implement.md` |
```

- [ ] **Step 4: Add Loop 10**

After the `### Loop 9 — DAILY-REPORT` block (after its closing code fence, before the final `---`), insert:

````markdown
### Loop 10 — IMPLEMENT  (`cron: 1,21,41 6-20 * * 1-5`, recurring) — skip if ${issueTracker.issueTypes.implement} is empty/none

```
Autonomous "my stories" — IMPLEMENT TICK (weekday work hours). First read .claude/stack.md. IMPLEMENT-TYPE ISSUES ONLY: issuetype in ${issueTracker.issueTypes.implement}, selected via ${issueTracker.myWorkQuery} — USER-SCOPED + active iteration, not the whole backlog. One action per tick. Full spec: .claude/loops/implement.md

STEP 1 — RECONCILE prior IMPLEMENT work first. git fetch origin. Look for a PR this loop created (head per ${vcs.branchNaming}, base ${vcs.integrationBranch}, author me) for an implement-type issue currently in ${states.inProgress}:
- MERGED → transition that issue ${states.inProgress}→${states.verify} (state name, or id from ${issueTracker.transitionIds}) so STORY-VERIFY can pick it up. STOP.
- OPEN, all required checks GREEN → merge per ${vcs.autoMerge}; on success transition the issue→${states.verify}. STOP. (Blocked by branch protection/required approvals → leave open, note, STOP — never override.)
- OPEN, any check PENDING/queued → STOP (a later tick retries).
- OPEN, a check FAILING → leave open — the PR-SHEPHERD loop triages and fixes it. STOP.

STEP 2 — START a new story (only if no in-flight loop PR). Query my ${issueTracker.issueTypes.implement} issues in ${states.todo} via ${issueTracker.myWorkQuery} (ORDER BY priority DESC, key ASC), EXCLUDING any key in .claude/loops/state/my-stories-implement-parked.txt. None → STOP.
- Overlap guard: `git status --porcelain` over source/test dirs shows ANY change other than .claude/scheduled_tasks.lock → STOP.
- Pick ONE. Transition it ${states.todo}→${states.inProgress} BEFORE working.
- git fetch origin; branch per ${vcs.branchNaming} (default type feat) off latest origin/${vcs.integrationBranch}.
- HARVEST (mandatory): dispatch the issue harvester agent (Harvey) → full AC context (description, comments, parent/Epic chain, related issues, linked docs, design links).
- BRIEF (mandatory): dispatch the architect agent (Archie) with the harvest → binding Architecture Brief. scope_verdict=needs-decomposition → append "<KEY> # <reason>" to .claude/loops/state/my-stories-implement-parked.txt, transition the issue back to ${states.todo}, delete the branch, STOP.
- IMPLEMENT as a small team: design links present AND ${design.figma} ≠ none → run the implement-designs skill with the Architecture Brief as binding input. Otherwise run the implement command's Team Dispatch: coder (Cody) from the Team Briefing (AC + brief + the command's guidelines), tester (Tess), review panel Cleo+Rex+Tia (unanimous), resolver (Sol) on concerns then re-run.
- FINISH: green gate per skills/shared/green-gate.md, commit, push, open PR → ${vcs.integrationBranch}, enable auto-merge (`gh pr merge --auto --squash`) if supported. Never force-merge or override protection. STOP.
```
````

- [ ] **Step 5: Update the Related section**

In the final `## Related` list, extend the devfix line: change `` `devfix` — the skill each FIX tick runs. `github-pr-review` — the skill each PR-REVIEW tick runs. `` to `` `devfix` — the skill each FIX tick runs. `commands/implement.md` + `implement-designs` — what each IMPLEMENT tick runs. `github-pr-review` — the skill each PR-REVIEW tick runs. ``

- [ ] **Step 6: Verify and commit**

Run: `node --test tests/*.test.mjs` — expected PASS.

```bash
git add plugins/loop-stack/skills/launch-loop-stack/SKILL.md
git commit -m "feat(launch-loop-stack): register the IMPLEMENT loop (Loop 10)"
```

---

### Task 6: Teardown + state file in `stop-loop-stack`

**Files:**
- Modify: `plugins/loop-stack/skills/stop-loop-stack/SKILL.md`

**Interfaces:**
- Consumes: prompt signature `— IMPLEMENT TICK` (Task 5), park file name (Task 4).

- [ ] **Step 1: Make the edits**

1. Frontmatter description (line 3): change `— delete the FIX, VERIFY, STORY-VERIFY, PR-REVIEW, DEPLOY-FIX, PR-SHEPHERD, E2E-SWEEP, DAILY-REPORT, and SYNC-INTEGRATION recurring crons` to `— delete the FIX, IMPLEMENT, VERIFY, STORY-VERIFY, PR-REVIEW, DEPLOY-FIX, PR-SHEPHERD, E2E-SWEEP, DAILY-REPORT, and SYNC-INTEGRATION recurring crons`.
2. Signature table: after the **FIX** row insert:
   `| **IMPLEMENT** | `— IMPLEMENT TICK` (matches `Autonomous "my stories" — IMPLEMENT TICK`) | `.claude/loops/implement.md` |`
3. Report list (step 5, line ~43): change `(FIX / VERIFY / STORY-VERIFY / PR-REVIEW / DEPLOY-FIX / PR-SHEPHERD / E2E-SWEEP / DAILY-REPORT / SYNC-INTEGRATION)` to `(FIX / IMPLEMENT / VERIFY / STORY-VERIFY / PR-REVIEW / DEPLOY-FIX / PR-SHEPHERD / E2E-SWEEP / DAILY-REPORT / SYNC-INTEGRATION)`.
4. State-files list: after the `my-stories-verify-parked.txt` bullet insert:
   `- `.claude/loops/state/my-stories-implement-parked.txt` — stories IMPLEMENT has parked (needs-decomposition, ambiguous AC, missing design).`
5. Related list: add `- `.claude/loops/implement.md` — full IMPLEMENT spec.`

- [ ] **Step 2: Verify and commit**

Run: `node --test tests/*.test.mjs` — expected PASS.

```bash
git add plugins/loop-stack/skills/stop-loop-stack/SKILL.md
git commit -m "feat(stop-loop-stack): tear down the IMPLEMENT loop; document its park file"
```

---

### Task 7: DAILY-REPORT surfaces the new park file

**Files:**
- Modify: `plugins/loop-stack/loops/daily-report.md` (the PARKED bullet, line ~32)
- Modify: `plugins/loop-stack/skills/launch-loop-stack/SKILL.md` (Loop 9 prompt, step 1)
- Modify: `plugins/loop-stack/CONVENTIONS.md` (state-file list, line ~92)

**Interfaces:**
- Consumes: `.claude/loops/state/my-stories-implement-parked.txt` (Task 4).

- [ ] **Step 1: Make the edits**

1. `loops/daily-report.md`, in the **PARKED** bullet: after `` `.claude/loops/state/my-stories-verify-parked.txt`, `` insert `` `.claude/loops/state/my-stories-implement-parked.txt` (stories the IMPLEMENT loop parked for a human — needs-decomposition or ambiguous AC), ``. Also add to `## Related`: `- `.claude/loops/implement.md` — writes the implement park file this loop surfaces.`
2. `skills/launch-loop-stack/SKILL.md`, Loop 9 prompt step 1: after `.claude/loops/state/my-stories-verify-parked.txt,` insert ` every line of .claude/loops/state/my-stories-implement-parked.txt,`.
3. `CONVENTIONS.md` state-file list: change `Current files: `my-bugs-verify-parked.txt`, `my-stories-verify-parked.txt`,` to `Current files: `my-bugs-verify-parked.txt`, `my-stories-verify-parked.txt`, `my-stories-implement-parked.txt`,`.

- [ ] **Step 2: Verify and commit**

Run: `node --test tests/*.test.mjs` — expected PASS.

```bash
git add plugins/loop-stack/loops/daily-report.md plugins/loop-stack/skills/launch-loop-stack/SKILL.md plugins/loop-stack/CONVENTIONS.md
git commit -m "feat(daily-report): escalate stories parked by the IMPLEMENT loop"
```

---

### Task 8: `commands/implement.md` — mandatory Harvest → Brief + Team Dispatch

**Files:**
- Modify: `plugins/loop-stack/commands/implement.md`

**Interfaces:**
- Consumes: `agents/architect.md` output contract (Task 2), `agents/jira-harvester.md`, personas (Task 3).
- Produces: the "Step 0.5" + "Team Dispatch" sections the IMPLEMENT loop's Phase I references (Task 4/5).

- [ ] **Step 1: Insert the Harvest → Brief phase**

After the `## Step 0: Load Graph Context (mandatory)` section (i.e. immediately before `## Step 1: Analyze and Understand Requirements`), insert:

```markdown
## Step 0.5: Harvest → Brief (mandatory before any implementation)

Two phases run before Step 1, in order — the same contract the autonomous IMPLEMENT loop uses:

1. **Harvest.** When an issue key/URL is in play (`${issueTracker.tool}` ≠ none), dispatch the
   issue harvester agent (**Harvey**, `agents/jira-harvester.md`) for the full ticket context —
   description, comments, subtask/parent, Epic chain, related issues, linked docs pages, design
   links — as structured AC YAML. No issue key → skip this phase; the provided spec/requirements
   stand in for the harvest.
2. **Brief.** Dispatch the **architect** agent (**Archie**, `agents/architect.md`) with the
   harvest output (or the provided spec). Archie returns the **Architecture Brief** — scope
   verdict, layers, dependency constraints, contracts, reuse-vs-create, data/migration needs,
   compliance notes, risks. The brief is **binding**: implementation follows it, and the
   `architecture-reviewer` seat (Rex) verifies the diff against it. `needs-decomposition` →
   stop and report the suggested split instead of implementing (autonomous callers park the
   issue; interactive callers ask the user).

Steps 1–8 below are then executed under the brief's constraints.
```

- [ ] **Step 2: Insert the Team Dispatch section**

Immediately after the new Step 0.5 section, insert:

```markdown
## Step 0.6: Team Dispatch (non-trivial implementations)

Run the implementation as a **small subagent team** using the existing roster — not
single-threaded inline work — whenever the change spans more than one file or carries any brief
risk flag:

- **Cody** (`agents/coder.md`) implements from the Team Briefing = Harvey's AC + Archie's brief +
  this command's Steps 1–8 as the implementation standard.
- **Tess** (`agents/tester.md`) runs all affected suites after Cody returns.
- The review panel votes independently and must be **unanimous**: **Cleo**
  (`agents/clean-code-reviewer.md`), **Rex** (`agents/architecture-reviewer.md`, brief in hand),
  **Tia** (`agents/test-integrity-reviewer.md`).
- **Sol** (`agents/resolver.md`) consolidates any concerns into one pass, then Tess + the panel
  re-run.

When `${integrations.superpowers}` is set, fan the independent seats out per
`superpowers:dispatching-parallel-agents` — see `skills/shared/superpowers-integration.md`.
Trivial one-file changes may run inline, still under the brief.
```

- [ ] **Step 3: Verify and commit**

Run: `node --test tests/*.test.mjs` — expected PASS.

```bash
git add plugins/loop-stack/commands/implement.md
git commit -m "feat(implement): mandatory Harvest -> Brief phases and small-team dispatch"
```

---

### Task 9: `implement-designs` accepts the Architecture Brief

**Files:**
- Modify: `plugins/loop-stack/skills/implement-designs/SKILL.md`

- [ ] **Step 1: Add the input note**

Directly after the **Lessons gate** blockquote (the one ending `Apply whatever the store returns.`, before the `---` and `## Scope boundaries`), insert:

```markdown
> **Architecture Brief (when provided).** When the caller passes an Architecture Brief from the
> `architect` agent (**Archie** — e.g. the IMPLEMENT loop or `commands/implement.md` Step 0.5),
> fold it into the Design Brief as **binding constraints**: the Analyzer honors its contracts,
> reuse-vs-create decisions, dependency direction, and data/compliance notes exactly as it honors
> stored lessons. No brief passed → this gate is a no-op.
```

- [ ] **Step 2: Verify and commit**

Run: `node --test tests/*.test.mjs` — expected PASS.

```bash
git add plugins/loop-stack/skills/implement-designs/SKILL.md
git commit -m "feat(implement-designs): honor a caller-provided Architecture Brief as binding input"
```

---

### Task 10: MANIFEST roster + counts

**Files:**
- Modify: `plugins/loop-stack/MANIFEST.md`

- [ ] **Step 1: Make the edits**

1. Loop table (lines 18–28): after the FIX row insert
   `| IMPLEMENT | `1,21,41 6-20 * * 1-5` | loops/implement.md (skipped if `${issueTracker.issueTypes.implement}` is empty) |`
2. Line 36: change `- **loops/ (7)** — per-tick specs (FIX/VERIFY/STORY-VERIFY, PR-REVIEW, DEPLOY-FIX, PR-SHEPHERD, SYNC-INTEGRATION, E2E-SWEEP, DAILY-REPORT).` to `- **loops/ (8)** — per-tick specs (FIX/VERIFY/STORY-VERIFY, IMPLEMENT, PR-REVIEW, DEPLOY-FIX, PR-SHEPHERD, SYNC-INTEGRATION, E2E-SWEEP, DAILY-REPORT).`
3. Line 38: change `- **agents/ (13)** — the implement/review agent team (analyzer, coder, tester, reviewers, resolver, designer, etc.), tool-agnostic.` to `- **agents/ (14)** — the implement/review agent team (analyzer, architect, coder, tester, reviewers, resolver, designer, etc.), tool-agnostic, each with a cozy display persona (Archie, Cody, Tess, …).`
4. Line 37 (skills bullet): after `the devfix fix-path,` add `the IMPLEMENT story-path (Harvest → architect Brief → team dispatch via commands/implement.md),` — keep the rest of the sentence unchanged.
5. In the "Key flows" section of the repo-root `CLAUDE.md` no change is needed (path split already names `implement`); but in MANIFEST's intro sentence listing the workflow (line 4, "my work in the active iteration"), no change required.

- [ ] **Step 2: Verify and commit**

Run: `node --test tests/*.test.mjs` — expected PASS.

```bash
git add plugins/loop-stack/MANIFEST.md
git commit -m "docs(manifest): add IMPLEMENT to the loop roster; agents 14, loops 8"
```

---

### Task 11: Version bump + README + final full-suite gate

**Files:**
- Modify: `plugins/loop-stack/.claude-plugin/plugin.json` (line 3: `"version": "1.5.0"`)
- Modify: `.claude-plugin/marketplace.json` (line 4 root `"version": "1.4.0"`, line 14 loop-stack entry `"version": "1.5.0"`)
- Modify: `README.md` (lines 30–31 "Current versions", line 37 loop-stack summary)

- [ ] **Step 1: Bump versions**

- `plugins/loop-stack/.claude-plugin/plugin.json`: `"version": "1.5.0"` → `"version": "1.6.0"`.
- `.claude-plugin/marketplace.json`: loop-stack entry `"version": "1.5.0"` → `"version": "1.6.0"`; root marketplace `"version": "1.4.0"` → `"version": "1.5.0"`.
- `README.md`: `Current versions: **loop-stack 1.5.0**,` → `Current versions: **loop-stack 1.6.0**,`.

- [ ] **Step 2: README workflow sentence**

In `README.md` line 37, change `auto-fix assigned bugs → verify against AC + deploys → review requested PRs` to `auto-fix assigned bugs → implement sprint stories behind a mandatory architect brief (Harvest → Brief → small agent team) → verify against AC + deploys → review requested PRs` — leave the rest of the sentence unchanged.

- [ ] **Step 3: Full suite (the CI gate)**

Run: `node --test tests/*.test.mjs`
Expected: ALL tests PASS — in particular `manifests.test.mjs` "version matches the marketplace entry" (this is exactly what catches a missed bump).

- [ ] **Step 4: Commit**

```bash
git add plugins/loop-stack/.claude-plugin/plugin.json .claude-plugin/marketplace.json README.md
git commit -m "chore(release): loop-stack 1.6.0 — IMPLEMENT loop + architect agent"
```

---

## Self-Review (done at plan-writing time)

- **Spec coverage:** loop spec → Task 4/5; architect agent → Task 2; cozy names → Tasks 2–3; onboarding key → Task 1; implement command Harvest→Brief + Team Dispatch → Task 8; implement-designs input → Task 9; launch/stop wiring → Tasks 5–6; daily-report + CONVENTIONS state file → Task 7; MANIFEST → Task 10; three-place version bump → Task 11. `onboard.mjs` loop materialization needs no change (directory-listing copy, Task 4 interface note).
- **Type consistency:** token `${issueTracker.issueTypes.implement}` (array, `[]`=disabled) and park file `my-stories-implement-parked.txt` and cron `1,21,41 6-20 * * 1-5` and signature `— IMPLEMENT TICK` are identical across Tasks 1, 4, 5, 6, 7, 10.
- **Placeholders:** none — full file contents given for created files; exact before/after text for edits.
