# SDLC Intake Pipeline — whole-knowledge harvest → Requirements → Designs → PRD → Dev Plan

Read `.claude/stack.md` first; use its values; never assume a specific tool; if a needed capability is
`none`, skip those steps — **except the three hard prerequisites below**; if the config is missing,
run the `onboard` skill and stop.

## What this is

One pipeline that turns everything an organization already knows — the whole tracker, the whole
documentation space, the designs — into the four artifacts a development team (and the AI assistants
those developers use) can actually execute against:

```
   sweep (breadth)            harvest (depth)          synthesize                 hand off
┌────────────────────┐   ┌──────────────────────┐  ┌─────────────────┐   ┌──────────────────────┐
│ issue-sweeper       │   │ issue-harvester       │  │ Requirements    │   │ PRD                  │
│  (Sweeney)         │──▶│  (Harvey)            │─▶│  (cited, deduped│──▶│  ↓                   │
│ docs-sweeper │   │ docs-harvester │  │   conflicts kept│   │ Task Master task tree│
│  (Dewey)           │   │  (Cora)              │  │   open Qs kept) │   │  (dependency-ordered)│
└────────────────────┘   └──────────────────────┘  └─────────────────┘   └──────────────────────┘
        │                          │                       ▲                        │
        └──── corpus on disk ──────┴──▶ vector index ──────┘                        ▼
                                       (+ graphify graph)                    dev plan + brief
```

Each phase's output is a file on disk, not a message in context. That is what makes a
whole-knowledge sweep survivable: **every phase is resumable, and no phase holds the corpus.**

## Tooling: nothing blocks, but missing tools make the run *incomplete*

**The pipeline never stops because a tool is absent.** It warns up front, runs everything it can, and
reports the outcome as `incomplete` with a named list of what was missing and what that cost. What it
must never do is deliver a degraded artifact as though it were the real one.

| Tool | Contract | Missing → |
|---|---|---|
| **Task Master** (`Lolibai/claude-task-master` fork) | `skills/shared/task-master-preflight.md` | Warn; PRD still produced, dev plan degrades to prose — no task ids, no dependency graph, no complexity scores |
| **Vector store** (qdrant / pgvector), corpus ≥ 300 records | `skills/shared/corpus-index.md` | Warn; requirements extracted from a prioritized **subset** — report records-read vs total |
| **graphify** | `skills/shared/corpus-index.md` | Warn once; no clustering, no centrality ranking of sources |
| **obsidian vault** (`${knowledge.vault}`) | `skills/shared/corpus-index.md` | Skip silently; no human-facing mirror |
| **design tool** (`${design.figma}`) | Phase 5 | Skip; `out/designs.md` records `none configured` |
| **issue tracker / docs platform** | `.claude/stack.md` | That half of the sweep is a no-op — say which half, and that the corpus is one-sided |

Warn **early, once, and specifically**. A user who will have to install something should learn it in
the first minute of a multi-hour harvest, not in the closing summary — and the warning must say what
the run will not contain, not merely that a tool is absent.

Every completed phase is banked on disk, so installing a missing tool and re-running resumes from the
first incomplete phase and re-sweeps nothing.

### The run outcome (carry it through every phase, report it at the end)

```yaml
outcome: complete | incomplete
missing: []           # tools that were absent
degraded: []          # what each absence cost, in concrete terms
not_produced: []      # artifacts that do not exist as a result
resume_from: null | sweep | index | harvest | requirements | designs | prd | dev-plan
```

An `incomplete` run is a perfectly good outcome — it is a silently incomplete run that is not.

---

## Phase 0 — Preflight (do this before touching a single API)

1. Read `.claude/stack.md`. If missing → run `onboard`, stop.
2. Run the **Task Master preflight** — `skills/shared/task-master-preflight.md`. Record
   `available` / `initialized` / `fork`. Emit the fork note now, not at the end: a user who is going
   to have to install something should learn it in the first minute of a long run, not the last.
3. Check `${memory.store}` (qdrant / pgvector / none) and note it — the blocking decision happens in
   Phase 2, once the corpus size is known, per `skills/shared/corpus-index.md`.
4. Check optional layers: graphify, `${knowledge.vault}`, `${design.figma}`, `${compliance}`.
5. Create `.claude/sdlc/` (`corpus/`, `state/`, `out/`) and ensure it is gitignored. **A harvested
   corpus can contain customer names, internal decisions, and — in a healthcare-adjacent project —
   PHI. It must never be committed.** Add the ignore rule before the first write, not after.
6. Print the plan: scope, prerequisites satisfied/missing, and where output will land. Then proceed.

**Resume check:** if `.claude/sdlc/state/pipeline.json` exists, report which phases are complete and
restart from the first that is not. Never silently re-run a completed phase — on a large harvest that
is hours of work and a large bill.

---

## Phase 1 — Sweep (breadth, parallel)

Dispatch both sweepers **concurrently** — they touch different systems and share nothing:

- **`issue-sweeper`** (Sweeney) — scope defaults to the whole project, `include_done: true`,
  `max_issues: 0`. Closed issues carry the decisions; a sweep that excludes them harvests only the
  present sprint.
- **`docs-sweeper`** (Dewey) — scope defaults to every space in `${docs.spaces}`, exhaustive.

Then **cross-seed once, and only once**: feed Sweeney's `docs_page_ids` into Dewey as
`seed_page_ids` (catching pages outside the configured spaces that tickets link to), and check
Dewey's `linked_issue_keys` against Sweeney's index for issues outside the swept scope. Re-sweep only
if the delta is material — say how many were added.

Do not follow links transitively. One cross-seeding round is deliberate scoping; unbounded link
following is how a "sweep the project" run ends up reading the entire wiki of a neighbouring team.

**Gate:** both sweeps report `status: complete` (or `partial` with cursors intact). Write the totals
to `state/pipeline.json`. Report the corpus size — this is the number Phase 2 blocks on.

---

## Phase 2 — Index (the retrieval layer)

Per `skills/shared/corpus-index.md`:

1. Total records = issues swept + pages swept.
2. **< 300** → indexing optional; note it and continue reading the corpus directly.
3. **≥ 300 and `${memory.store}` is `none`** → warn (qdrant or pgvector), mark the run `incomplete`,
   and continue under the shared file's **degraded retrieval rule**: a stated priority order, with
   records-read reported against the total. The corpus is banked, so installing a store and re-running
   resumes here.
4. Otherwise: embed the corpus incrementally (skip unchanged records via the index cursor), with the
   payload contract from the shared file — `authority` and `freshness` included, because that is what
   lets Phase 4 detect a stale-canonical conflict instead of silently inheriting it.
5. If graphify is available, build the graph from the same corpus and record the output path.

**Gate:** index reports a chunk count and a resolvable `corpus_path` on every chunk. Spot-check three
random chunks by resolving them back to disk — an index whose pointers don't resolve is worse than no
index, because everything downstream will trust it.

---

## Phase 3 — Harvest (depth, batched, parallel)

Consume the ranked queues from Phase 1 — never the raw corpus:

- **`issue-harvester`** (Harvey) over `harvest-queue.txt`, in batches.
- **`docs-harvester`** (Cora) over `read-queue.txt`, in batches of 10–25 pages. Cora reads
  **whole pages, never excerpts** — the same rule `implement-designs` applies to design nodes, for
  the same reason.

Run several batches concurrently, but keep each batch's output on disk and only summaries in context.
When a harvester returns `new_links` pointing at unqueued pages/issues, decide **explicitly** whether
to widen — and record the decision. Silent widening makes a run unreproducible; silent narrowing loses
requirements.

Re-dispatch anything reported as `not_read` before declaring the phase complete. A page that fell out
of a batch is a requirement nobody will ever see again.

**Gate:** every queued item is read or explicitly recorded as unreadable with a reason (permissions,
deleted, empty). Report the count of each.

---

## Phase 4 — Requirements (the first artifact)

Synthesize `out/requirements.md` from the harvested records, using the index to retrieve rather than
reading shards. For each requirement:

- one testable statement,
- **every** source cited (`PROJ-123`, `page:4471#Checkout`) — an uncited requirement is a
  hallucination nobody can check,
- status: `agreed` (canonical + uncontradicted), `contested` (sources disagree), or `unverified`
  (single stale/draft source),
- category: functional / non-functional / constraint / compliance.

Then, deliberately:

- **Deduplicate** near-identical requirements across tracker and docs — cite all sources on the
  survivor rather than dropping the losers.
- **Keep every contradiction.** Never resolve one yourself. A `contested` requirement with both sides
  cited is useful; a quietly-picked side is how the wrong thing ships.
- **Keep every open question** as an open question. Do not answer them from inference.
- **Carry the sweep gaps forward** — `missing_ac`, `stale_canonical`, `untracked`, `design_missing`.
  These are findings about the organization's knowledge, and this document is the only place they will
  ever be seen together.
- When `${compliance}` ≠ none, flag every requirement touching sensitive data.

**Gate:** requirement count > 0; 100% cited; contested and open items counted in the summary. If the
corpus was large and the requirement count is suspiciously small, say so — that is a retrieval failure,
not a tidy backlog.

---

## Phase 5 — Designs

Only when `${design.figma}` ≠ none; otherwise write `out/designs.md` as `none configured` and move on.

Run the **`design-link-audit`** skill over the harvested corpus first. The sweeps' `design_missing`
flag only answers "was a URL present?" — the audit answers the question that actually predicts
accuracy: is the reference node-precise, does it resolve, and is it current relative to the AC? A
link to a whole file, a deleted node, or a design last touched before the AC changed all read as
"covered" in a sweep and deliver nothing to whoever implements the story.

Then take the `design_urls` collected by both sweeps and the harvesters, and for each: read the design
context via the design tool's MCP (never a browser — the `designs` command's rule), and audit **every**
node, not a sample (`implement-designs`' rule). Map each design to the requirements it satisfies.

Record in `out/designs.md`:

- the `design-link-audit` findings, severity-ordered,
- design → requirement coverage, both directions,
- **requirements with no design** (UI-shaped work nobody has drawn),
- **designs with no requirement** (drawn work nobody has specified — as common, and more dangerous),
- design tokens/variables in play, for the drift audit that follows implementation
  (`css-drift-auditor` consumes this),
- component candidates, deferring composition decisions to `lego-philosophy`.

**Gate:** every design URL is either audited or listed as inaccessible with a reason, and every
UI-shaped requirement has an audit verdict. Carry `blocker`-severity findings into the PRD's open
questions — a requirement whose design does not resolve is an open question, not a specification.

---

## Phase 6 — PRD (the synthesis)

Write `out/prd.md` — a single document that Task Master can parse and a human can review:

1. **Context** — what this product/area is, from the canonical docs, cited.
2. **Goals / non-goals** — non-goals drawn from the `decisions` records (things explicitly rejected).
   This section is what stops the plan from re-proposing what the team already ruled out.
3. **Requirements** — the `agreed` set from Phase 4, grouped by capability, each cited.
4. **Constraints** — non-functional, compliance, data-handling, performance.
5. **Existing state** — what already exists per the corpus and the code, so the plan does not
   re-specify shipped behaviour.
6. **Design references** — from Phase 5.
7. **Open questions and contradictions** — verbatim from Phase 4, at the front of the document's
   review section, not buried. **A PRD that hides its unknowns produces a plan built on invented
   answers.**
8. **Out of scope / deferred** — with the reason and the citation.

Write for two audiences at once: a human reviewer and a task generator. That means explicit,
numbered, self-contained requirements — no "as discussed above", no pronouns crossing sections.
If graphify ran, use the community clusters to order the capability sections so related requirements
sit together.

**Gate:** stop and ask for human review before Phase 7 when there are `contested` requirements or open
questions that change scope. Generating a task tree on top of an unresolved contradiction propagates
it into every branch and every developer's assistant.

---

## Phase 7 — Dev plan (Task Master)

Per `skills/shared/task-master-preflight.md`. If Task Master is unavailable → warn, write
`out/dev-plan.md` as a **prose plan explicitly labelled as the degraded form**, mark the run
`incomplete` with `not_produced: [task tree, dependency ordering, complexity scores]`, and finish
Phase 8 normally. The PRD is banked, so installing it later resumes from here.

1. `initialize_project` / `task-master init` if `.taskmaster/` is absent.
2. `parse_prd` on `out/prd.md`.
3. `analyze_project_complexity` — score everything.
4. `expand_task` on anything scored heavy, until each leaf is one reviewable pass by one developer.
5. Verify the dependency graph: no cycles, no task depending on something out of scope, every
   requirement in the PRD traceable to at least one task. **Report requirements with no task** — that
   is the plan's coverage gap, and it is invisible unless you look for it.

Then write `out/dev-plan.md` for the humans: task tree with ids, dependency order, the suggested
parallelization (what can start at once), the requirement each task satisfies with its citation, and
the open questions blocking specific tasks.

**Write for developers who use AI.** Each task needs enough self-contained context that an assistant
reading only that task does not have to re-derive scope: the requirement text, the citation, the files
or areas involved, and the acceptance criteria. That is the whole point of the artifact — one shared,
machine-readable plan, so every developer's AI reads the same thing instead of each inventing its own
interpretation of the PRD.

**Gate:** every task has an id, a dependency list, and at least one cited requirement.

---

## Phase 8 — Publish and hand off

1. **Vault mirror** (when `${knowledge.vault}` is set): write the four artifacts plus per-requirement
   notes into a dated Obsidian subfolder, wiki-linked to sources. Never touch notes the pipeline did
   not create.
2. **Write back** (only when the user approves — this is outward-facing): create/update a docs page
   with the PRD, and/or create tracker issues from the task tree. Ask first, every time, and say
   exactly what will be created where. Never mass-create tickets silently.
3. **Run report** — phases completed, corpus totals, requirement/task counts, gaps carried forward,
   prerequisites missing, and every artifact path.

Then say plainly what a human must decide: the contested requirements, the open questions, the
uncovered requirements, and the stale-canonical pages. That list is the real output of a
whole-knowledge harvest — the artifacts are just how it is delivered.

---

## Invariants

- **Read-only against source systems.** The sweep and harvest phases never transition, comment on, or
  edit an issue or page. Writes go to `.claude/sdlc/`, and outward-facing writes happen only in
  Phase 8, only with approval.
- **Never hold the corpus in context.** Indexes, queues, and summaries only.
- **Every requirement is cited.** No exceptions.
- **Contradictions and open questions survive to the PRD.** Resolving them is a human's job.
- **Never re-sweep on resume.** The corpus and cursors are the resume point.
- **The corpus is gitignored** and may contain sensitive material; treat it as such.
