# Autonomous Loop Stack — universal, config-driven

A portable set of skills, agents, commands, and loops that drive an autonomous
"my work in the active iteration" workflow in **any** project. Nothing is hardcoded:
project specifics live in **`.claude/stack.md`**, written and refreshed by the `onboard` skill,
and every file reads from it. See `CONVENTIONS.md` for the token → config mapping.

## Bring it to a project (3 steps)

1. Install it: `/plugin marketplace add Lolibai/claude-development-plugin` then `/plugin install loop-stack@dev-tools` — or copy this directory's `skills/`, `agents/`, `commands/`, `loops/` into the project's `.claude/`.
2. Run **`onboard`** — detects the stack, writes `.claude/stack.md` (issue tracker, branch model, package manager, frameworks, backend/DB, edge, tests, CI/deploy, design, reporting), creates the gitignored `.claude/loops/state/` dir, and materializes `loops/*.md` into `.claude/loops/` (cron prompts reference them there).
   Re-running is safe and now **self-healing**: a materialized spec you have not edited is refreshed to the current version (so upstream fixes reach projects that onboarded long ago), while any spec you *have* edited is left untouched and reported. Provenance comes from `loops/.known-hashes.json` — every version this stack has ever shipped.
3. Run **`launch-loop-stack`** — registers the session crons, now driven entirely by your config.

Anything in the config set to `none`/empty is skipped — no deploy gate if you have no CI, no tracker transitions if you use GitHub Issues, etc. **Testing is the one exception:** every implementation ends with the full unit suite and the full E2E suite green, and a missing harness is surfaced with an offer to build it (Gherkin + page objects + typed web-element wrappers + hooks) rather than silently skipped — see `skills/shared/green-gate.md`.

## Loops (session-only crons created by `launch-loop-stack`)

| Loop | Cadence (cron) | Spec file |
|---|---|---|
| FIX | `*/5 6-20 * * 1-5` | loops/my-bugs-in-sprint-devfix.md |
| IMPLEMENT | `1,21,41 6-20 * * 1-5` | loops/implement.md (skipped if `${issueTracker.issueTypes.implement}` is empty) |
| VERIFY | `3-58/5 * * * *` | loops/my-bugs-in-sprint-devfix.md |
| STORY-VERIFY | `2-57/5 * * * *` | loops/my-bugs-in-sprint-devfix.md |
| PR-REVIEW | `*/10 * * * *` | loops/pr-review.md |
| DEPLOY-FIX | `4,14,24,34,44,54 * * * *` | loops/deploy-failure-fix.md (skipped if no deploy workflows) |
| PR-SHEPHERD | `6,16,26,36,46,56 * * * *` | loops/pr-shepherd.md (my open PRs: review-respond / CI-fix / conflict-resolve) |
| SYNC-INTEGRATION | `9,39 * * * *` | loops/sync-integration.md (keeps fix-base branches synced with env branches; skipped if none configured) |
| E2E-SWEEP | `11,31,51 * * * *` | loops/e2e-sweep.md (small time-boxed scenario batch per tick → rolling suite-health report; skipped if no e2e runner) |
| DAILY-REPORT | `59 16 * * 1-5` | loops/daily-report.md (read-only standup summary + parked-item escalation) |

Scoping invariant: work is selected by `${issueTracker.myWorkQuery}` — user-scoped + the active iteration, never the whole backlog. Each tick does one action, gates strictly on green tests (+ deploy when configured), and never overrides branch protection.

## SDLC intake pipeline (`commands/sdlc.md`) — upstream of the loops

The loops deliver work that is already specified. This pipeline is what produces the specification:
a whole-knowledge harvest of the tracker and the docs space, turned into Requirements → Designs → PRD
→ a Task Master dev plan. It is run on demand, not on a cron.

| Stage | Agent / contract | Role |
|---|---|---|
| Sweep (breadth) | `agents/issue-sweeper.md` (Sweeney) | Whole tracker → sharded corpus + ranked harvest queue + coverage gaps |
| Sweep (breadth) | `agents/docs-sweeper.md` (Dewey) | Whole docs space tree → metadata corpus + ranked read queue |
| Index | `skills/shared/corpus-index.md` | Corpus → qdrant/pgvector; optional graphify graph + obsidian mirror |
| Harvest (depth) | `agents/issue-harvester.md` (Harvey) | One ticket, complete: AC, epic chain, links |
| Harvest (depth) | `agents/docs-harvester.md` (Cora) | Whole pages, never excerpts: requirements, decisions, contradictions |
| Designs | `skills/design-link-audit/` | Do stories/specs carry a *usable* design reference — node-precise, resolvable, current? |
| Plan | `skills/shared/task-master-preflight.md` | PRD → dependency-ordered, complexity-scored task tree |

Corpus and cursors live in the project's gitignored `.claude/sdlc/` (`corpus/`, `state/`, `out/`) —
never `/tmp`, never a shared path, and never committed: it holds harvested issues and pages verbatim.
Every phase is resumable, no phase holds the corpus in context, and a missing tool degrades the run
(`outcome: incomplete`) rather than blocking it.

## Layout

- **skills/onboard/** — writes `.claude/stack.md` (`onboard.mjs` + `stack.example.md`) and drops the universal `CLAUDE.template.md` as the project's root `CLAUDE.md`. Run first.
- **skills/design-link-audit/** — checks that stories/specs carry a *usable* design reference (presence, resolvability, node precision, freshness vs the AC, two-way coverage); run by the SDLC design phase, devfix Phase 0, and `implement`. Reports gaps as accuracy risks; never blocks.
- **skills/lego-philosophy/** — the reusable, project-agnostic UI architecture rule (smart/dumb split + component inventory); the root `CLAUDE.md` and `frontend-component-conventions` reference it.
- **loops/ (8)** — per-tick specs (FIX/VERIFY/STORY-VERIFY, IMPLEMENT, PR-REVIEW, DEPLOY-FIX, PR-SHEPHERD, SYNC-INTEGRATION, E2E-SWEEP, DAILY-REPORT).
- **skills/ (~30)** — orchestration (launch/stop-loop-stack), the devfix fix-path, the IMPLEMENT story-path (Harvest → architect Brief → team dispatch via commands/implement.md), the gherkin sub-flow, test/review/memory skills, and `scaffold-test-projects` (bootstrap a Gherkin-driven Playwright E2E project + unit tests: page objects, web-element wrappers, hooks). Tool-specific skills are generic + config-driven (database-migration, serverless-function, memory-first, test-management-sync).
- **agents/ (17)** — the implement/review agent team (analyzer, architect, coder, tester, reviewers, resolver, designer, etc.), tool-agnostic; the implement team carries cozy display personas (Archie, Cody, Tess, …).
- **commands/ (11)** — fix/PR-flow slash commands.
- **CONVENTIONS.md** — how every file stays universal (the config contract + token map).

## The contract every file follows

> Read `.claude/stack.md` first. Use its values; never assume a specific tool. If a needed
> capability is `none`, skip those steps. If the config is missing, run `onboard` and stop.
> **Testing excepted:** an absent unit/E2E harness is reported with the `scaffold-test-projects`
> offer, never a silent skip (`skills/shared/green-gate.md`).

## Shared contracts (single sources of truth — reference, never restate)

| File | Owns |
|---|---|
| `skills/shared/no-hardcoded-instructions.md` | Generated per-project files + cron prompts carry the query, never its result (the frozen-work-list failure) |
| `skills/shared/green-gate.md` | The post-implementation gate: all unit tests green + all E2E green, or offer the scaffold |
| `skills/shared/corpus-index.md` | The harvest corpus + retrieval layer (qdrant/pgvector, graphify, obsidian) and its degrade rule |
| `skills/shared/task-master-preflight.md` | Task Master presence check, the `Lolibai/claude-task-master` fork note, and its degrade rule |
| `skills/shared/definition-of-done.md` | The DoD checklist every implementation task satisfies |
| `skills/shared/finish-line.md` | Phases 3b → DONE (format, push, writeback, PR, PR-review, closing gate) |
| `skills/shared/superpowers-integration.md` | Optional delegation of shared disciplines to the superpowers plugin |
| `skills/shared/phase-dc.md`, `phase-live-render.md`, `toolchain-gotchas.md` | Double-check audit, live-render check, static infra gotchas |

## Superpowers integration (optional)

If the official **superpowers** plugin is installed, `onboard` records `integrations.superpowers: yes`
in `.claude/stack.md`, and the shared engineering disciplines delegate to it: TDD, systematic
debugging, verification-before-completion, requesting/receiving code review, parallel-agent
dispatch, and finishing-a-development-branch. When it is absent (`no`), every touchpoint falls back
to its built-in checkpoint — nothing hard-depends on superpowers. The delegation contract and the
full touchpoint → skill map live in **`skills/shared/superpowers-integration.md`** (the single source
of truth; other files reference it, never restate it).
