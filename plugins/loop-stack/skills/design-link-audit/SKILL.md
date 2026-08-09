---
name: design-link-audit
description: Audits whether stories, specs, and requirement docs actually carry usable design references — presence, resolvability, node-level precision, freshness, and two-way coverage — and reports every gap as an explicit accuracy risk rather than letting implementation start on an unstated visual spec. Reads ${design.figma}, ${issueTracker.*}, ${docs.*} from .claude/stack.md. Use before implementing UI-shaped work, in the SDLC intake pipeline's design phase, during a devfix/implement Phase 0 harvest, or whenever a sweep reports design_missing. No-ops when ${design.figma} is none.
---

# Design-Link Audit

> **Read `.claude/stack.md` first; use its values; never assume a specific tool.** The design tool
> (`${design.figma}` — e.g. Figma), the issue tracker (`${issueTracker.*}`), and the docs platform
> (`${docs.*}`) come from config. **If `${design.figma}` is `none`, this skill is a no-op** — report
> `status: skipped` and let the caller continue. If the config is missing, run `onboard` and stop.

## Why this exists

A story that says "update the settings panel" with no design link is not a small gap — it is an
**unstated specification**. Someone will implement it, and what they build will be judged against a
design they never saw. The failure is invisible at implementation time and expensive at review time,
and it is the same failure mode whether the reader is a developer or an AI assistant: both fill the
silence with an invention.

Worse, the *presence* of a link is not the same as the presence of a design. A link to a whole file
with no node id, a link to a deleted frame, a link to last quarter's version, a link buried in a
comment three replies deep — each reads as "the design exists" in a sweep and delivers nothing at
implementation time. This skill checks what a link-presence flag cannot.

## What it audits (five checks, in order)

### 1. Is this work UI-shaped at all?

Only UI-shaped work needs a design. Classify from the summary, description, and AC:

- **UI-shaped** — new screen/page/component, visual change, layout, states (empty/loading/error),
  copy shown to users, responsive behaviour, theming.
- **Not UI-shaped** — API, data model, migration, infra, refactor, pure logic.
- **Ambiguous** — say so rather than guessing. An ambiguous item with no design is reported as
  `needs_triage`, not as a violation; over-reporting trains people to ignore the report.

Missing designs on non-UI work are **not** findings. A report that flags every backend ticket is one
nobody reads.

### 2. Is a design reference present at all?

Scan, in this order — and record **where** the link was found, because location predicts reliability:

| Location | Reliability |
|---|---|
| The issue's design/URL field, when the tracker has one | authoritative |
| The description body | good |
| A linked spec/requirements page (`${docs.*}`) | good |
| An issue comment | weak — often superseded by a later comment |
| A parent/epic only | weak — the child may be a different screen entirely |
| An attached image with no link | **not a design reference** — record as `screenshot_only` |

A screenshot is evidence, not a spec: it carries no tokens, no states, no measurements, no layers.
Treat `screenshot_only` as a gap with a softer severity, never as coverage.

### 3. Does the reference resolve, and is it node-precise?

For each link, extract the file key and node id per the design tool's URL format (for Figma:
`…/design/:fileKey/:name?node-id=1-2` → node `1:2`; branch URLs use the branch key as the file key).
Then resolve it via the design tool's **MCP** — never a browser (the `designs` command's rule).

Findings:

- **`unresolvable`** — the file or node does not exist, or access is denied. Say which: a permissions
  failure is a five-minute fix, a deleted node is a re-design.
- **`file_level_only`** — a link with no node id. It points at a document, not at the thing being
  built; whoever implements it will pick a frame by guessing.
- **`node_missing`** — the file resolves, the node does not (renamed, deleted, or moved).
- **`wrong_file`** — resolves to a file outside the project's known design files/design system, when
  the config or prior harvest establishes what those are. Often a copied link from another product.

### 4. Is it current relative to the requirement?

Compare the design's last-modified timestamp against the issue's last substantive update and against
any AC changes:

- **`design_older_than_ac`** — the AC changed after the design was last touched. The design may not
  express the current requirement. This is the quietest and most common accuracy gap of all: both
  artifacts exist, both look fine, and they describe different products.
- **`design_newer_than_ticket`** — the design moved after the ticket was written. The ticket's
  description may understate the scope.

Report both as `stale_pairing` with the two timestamps and which side moved. **Never guess which one
is authoritative** — that is a product decision.

### 5. Two-way coverage

Run in both directions over the set being audited:

- **Requirements with no design** — UI-shaped work nobody has drawn.
- **Designs with no requirement** — drawn work nobody has specified. Equally dangerous and far less
  often noticed: it is how scope arrives in a sprint without ever being agreed.

## Where this runs

| Caller | When |
|---|---|
| `commands/sdlc.md` Phase 5 | Over the whole harvested corpus — the pipeline's design coverage report |
| `agents/issue-sweeper.md` | Its `design_missing` gap list is this skill's input, not its conclusion |
| `devfix` / `implement` Phase 0 | On one ticket, before any code is written |
| `commands/designs.md`, `figma-plan-and-validate` | As the precondition check before planning from a design |
| Standalone | "audit design coverage for epic X" |

Single-item and corpus-wide runs use the same checks; only the scale of the output differs.

## Output

```yaml
design_link_audit:
  status: complete | skipped
  skip_reason: null | "${design.figma} is none"
  scope: {kind: issue | epic | corpus | page-set, ref: "..."}
  totals:
    audited: 0
    ui_shaped: 0
    covered: 0            # node-precise, resolvable, not stale
    gaps: 0
    needs_triage: 0       # ambiguous UI-shape, not counted as a violation
  findings:
    - ref: "PROJ-123" | "page:4471"
      ui_shaped: true | false | ambiguous
      severity: blocker | risk | note
      finding: missing | screenshot_only | file_level_only | unresolvable | node_missing | wrong_file | stale_pairing | design_without_requirement
      found_in: field | description | docs_page | comment | parent | none
      design_url: "..." | null
      detail: "..."          # timestamps for stale_pairing; the error for unresolvable
  coverage:
    requirements_without_design: []
    designs_without_requirement: []
  verdict: ok | gaps-found
  accuracy_note: "..."       # one line: what implementing this set today would be guessing at
```

**Severity rubric.** `blocker` — UI-shaped work with no usable design reference at all, or an
unresolvable one. `risk` — `file_level_only`, `screenshot_only`, `stale_pairing`, `wrong_file`.
`note` — everything else, including `needs_triage`.

## Rules

- **Never invent a design.** If none is linked, the finding is "none linked" — not a search of the
  design tool for something with a similar name. A plausibly-matching frame from an adjacent project
  is worse than nothing, because it looks like an answer.
- **Never resolve a `stale_pairing` yourself.** Report both timestamps and let a human decide which
  artifact is authoritative.
- **Findings, not blocking.** This skill reports; the caller decides. A `blocker` severity means "do
  not start this item silently", not "the run stops" — consistent with the warn-and-degrade rule in
  `CONVENTIONS.md`. When the caller proceeds anyway, the accuracy note must survive into its output.
- **No design tool configured → no-op**, not a finding. You cannot audit links to a tool the project
  does not use.
- Read-only: never edit an issue, page, or design. Writing findings back to the tracker is the
  caller's decision and needs the user's approval.
