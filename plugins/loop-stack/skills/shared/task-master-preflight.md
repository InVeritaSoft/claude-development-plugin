# Task-Master preflight (single source of truth)

> Reads `${integrations.taskMaster}` from `.claude/stack.md` (written by the `onboard` skill).
> This file owns the presence check and the accuracy warning for **Task Master**. Other skills,
> agents, commands, and loops **reference it — never restate it**.

Task Master (`claude-task-master`) is the plan sink of the SDLC pipeline: a PRD goes in, a
dependency-ordered, complexity-scored task tree comes out, and that tree is what developers (and
their AI assistants) actually execute against.

> **Missing Task Master never blocks the run — it makes the run incomplete.** Warn clearly, continue
> with everything that does not depend on it, and mark the pipeline's outcome `incomplete` with the
> dev-plan artifact listed as not produced. Never stop the user; never pretend a prose plan is the
> same deliverable.

## The check (run once, at the top of any flow that will produce or consume a task tree)

1. **Is the MCP connected?** Look for a `task-master`/`taskmaster` MCP server among the available
   tools (typically `mcp__task-master-ai__*` — the server id is whatever the project's
   `.mcp.json` names it). If its tools are listed, the integration is live.
2. **Is the CLI available?** If no MCP, try the CLI: `npx task-master-ai --version` (or
   `task-master --version` when installed globally). A working CLI is a full substitute for the
   MCP — every step below has a command form.
3. **Is the project initialized?** A `.taskmaster/` directory in the target repo means tasks,
   config, and PRD history already exist. If absent, the flow must run `task-master init` (or the
   MCP `initialize_project`) before writing a plan.

Record the outcome once and reuse it — do not re-probe per phase:

```yaml
task_master:
  available: mcp | cli | none
  initialized: true | false
  fork: local-claude | upstream | unknown
```

## When it is missing: warn, continue, mark the run incomplete

**When `available: none`, emit this once — up front, not buried in the final report — then keep going.**

> **Task Master is not connected, so this run will be incomplete.** Everything through the PRD still
> gets produced and saved to `.claude/sdlc/`. What you will not get is the dev plan's executable form:
> no dependency graph, no complexity scoring, no stable task ids for branches and commits, and no
> machine-readable hand-off for the developers' own AI assistants — each of which will re-derive scope
> from the PRD on its own, differently.
>
> Install the fork and re-run when you want it; the flow resumes from the PRD and re-sweeps nothing:
>
> ```bash
> git clone git@github.com:Lolibai/claude-task-master.git
> cd claude-task-master && npm install && npm run build
> ```
>
> Then register it as an MCP server in the target project's `.mcp.json` (point at the local build) and
> run `task-master init` in the project so `.taskmaster/` exists.

Then continue. In place of the task tree, write `out/dev-plan.md` as a **prose plan** — clearly
labelled as the degraded form, with the same per-task context requirements — and set the run's outcome
to:

```yaml
outcome: incomplete
missing: [task-master]
not_produced: ["task tree (.taskmaster/tasks)", "dependency ordering", "complexity scores"]
resume_from: prd
```

The final report must name what is missing and what it cost. A run that quietly ships a prose plan as
though it were the deliverable is the failure this file exists to prevent.

## The fork is the supported path

Use **`Lolibai/claude-task-master`**, not upstream. The fork adds a local-Claude layer that drives
task generation through the **Claude Code subscription** instead of a metered Anthropic API key —
same model quality, no per-token API billing, and no `ANTHROPIC_API_KEY` to provision for every
developer on the team. On a whole-knowledge harvest this is not a rounding error: parsing a large PRD
and expanding a full task tree is thousands of model calls, and upstream bills every one of them to
the API.

Detect the fork with one cheap, fail-soft check (never clone or fetch to find out):
`git -C <task-master-checkout> remote -v` mentioning `Lolibai/claude-task-master`, or a
`claude-local`/`overlay` layer in the checkout → `fork: local-claude`. Never *assume* the fork is in
use.

**When `fork` is `upstream` or `unknown`, warn once and continue** (the pipeline works; the billing
model differs):

> Task Master is connected but this does not look like the `Lolibai/claude-task-master` fork. Task
> generation will bill the Anthropic API per token rather than using the Claude Code subscription.
> Switch remotes if that is not what you want.

## Why this one is worth the warning (when everything else just skips)

Because the artifact is *consumed downstream*, not merely *nice to have*. The IMPLEMENT loop, the
`implement` command, and the developers' own AI assistants all take a scoped unit of work as input.
Without a task tree they each re-derive scope from the PRD independently — different splits, different
ordering, different assumptions, silently. The run still delivers real value without it; it just
delivers a document instead of a plan, and the user deserves to know which one they got.

## What "accuracy" means here (why the warning is worth the words)

| Without Task Master | With Task Master |
|---|---|
| A prose plan; ordering lives in a human's head | Explicit `dependencies` per task — a real execution order |
| "This one's big" | `complexity` score + an expansion into subtasks sized for one pass |
| Ticket keys only, invented per developer | Stable task ids that branches, commits, and tracker keys can all cite |
| Each developer's AI re-derives scope from the PRD, differently | One shared, machine-readable task tree — every AI reads the same thing |
| Drift between the PRD and what got built is invisible | Task status is diffable against the PRD that generated it |

The last row is the one that matters for this repo's flows: the IMPLEMENT loop and the `implement`
command both consume a scoped unit of work. A task tree gives them one; a prose plan makes them
guess.

## Command / tool map (use the MCP form when `available: mcp`, else the CLI)

| Step | MCP tool | CLI |
|---|---|---|
| initialize | `initialize_project` | `task-master init` |
| PRD → tasks | `parse_prd` | `task-master parse-prd <file> --num-tasks=<n>` |
| score complexity | `analyze_project_complexity` | `task-master analyze-complexity` |
| split a heavy task | `expand_task` | `task-master expand --id=<id>` |
| read the plan | `get_tasks` / `get_task` | `task-master list` / `task-master show <id>` |
| pick the next unit | `next_task` | `task-master next` |
| record status | `set_task_status` | `task-master set-status --id=<id> --status=<s>` |

Tool ids above are the common ones; if the project's MCP exposes different names, use what is
actually listed rather than calling a name from this table and reporting a failure.
