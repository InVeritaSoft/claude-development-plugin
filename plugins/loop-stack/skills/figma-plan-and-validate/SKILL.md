---
name: figma-plan-and-validate
description: Config-driven workflow that creates a detailed, prompt-like implementation plan from design-tool designs, validates it against existing schemas and code, then runs a final gap-analysis pass to fix issues before implementation begins. Reads ${design.figma}, ${frontend.frameworks}, ${frontend.styling}, ${frontend.apps}, and ${memory.store} from .claude/stack.md; no-ops when ${design.figma} is none. Use when the user provides design-tool URLs and asks to plan or implement UI features, especially with phrases like "prepare for implementation", "plan from the design", "validate the plan", or "implement designs". Applies the component-library + utility-CSS hybrid pattern and smart/dumb component architecture the project uses.
---

# Design → Plan → Validate

Four-phase workflow. **Do not start implementation until Phase 4 is complete.**

> **Read `.claude/stack.md` first.** Use its values; never assume a specific tool. Read `${design.figma}`
> (the design tool, e.g. figma — or `none`), `${frontend.frameworks}`, `${frontend.styling}`,
> `${frontend.apps}`, and `${memory.store}`. If `${design.figma}` is **`none`**, this skill is a **no-op** —
> there is no configured design tool to plan from, so ask the user to paste a screenshot/spec and plan from
> that (or stop). If a needed capability is otherwise `none`/empty, skip those steps. If `.claude/stack.md` is
> missing, run the **`onboard`** skill and stop. Concrete tools named below (Figma + its MCP, MUI, Tailwind)
> are **examples** — match the configured stack.

---

## Phase 0: Load Context (MANDATORY)

Before touching the design tool or code:

1. **Knowledge store**: load via `memory-first` (`${memory.store}`) for the feature area and past decisions. If `none`, read `.claude/` notes.
2. **Read existing patterns**:
   - The shared UI package — available primitives
   - The shared theme module — the theme (single source of truth)
   - The utility-CSS config — tokens and breakpoints
   - Target file/feature folder for existing patterns

---

## Phase 1: Fetch ALL Design Nodes

**Never skip any URL.** For each node (Figma example):

```
fileKey = extract from URL path segment after /design/
nodeId  = node-id query param, replace "-" with ":"
```

Call the design tool's `get_design_context` on every node. If the response says "sparse metadata", call sub-layers individually by their IDs from the metadata output.

Batch parallel calls in groups of 3–4 for API sanity — **not** as a reason to trim the set. Audit **every** node; the context window is large (~1M) and the full design set fits. No representative subset, no "main screens only".

**Linked spec pages — read in full.** When the ticket links Confluence or other spec pages, fetch each **whole** page (e.g. `getConfluencePage` full body) plus the ticket description and **all** comments — never an excerpt or first-section skim — and merge every AC item into the plan. A linked page left unread blocks the plan.

**Document per node**:
- Node name / screen type (dashboard, edit modal, wizard step, empty state)
- Key UI elements: form fields, buttons, section cards, dialogs
- States captured: empty, filled, error, loading

---

## Phase 2: Codebase Cross-Check

Before writing a single line of the plan, verify against the project's actual source (use these as the *kinds* of things to check; resolve the real paths from the repo):

| What to check | Where to look |
|---|---|
| Validation schema fields | the app's validation/schema module |
| RPC/API mutation inputs | the relevant router/endpoint files |
| Existing shared UI | the shared UI package's exports |
| Data hooks | the shared contexts/hooks package |
| Enum values | the domain/core package |
| Existing constants | target page / feature file |

**For each form in the design**: count the visible fields and compare to the schema. Field-count mismatches = gap.

---

## Phase 3: Write the Plan

Use `CreatePlan` with this structure:

### Required sections

1. **Design system — single source of truth** (mermaid diagram showing theme → CSS vars → utility classes → components flow)
2. **The rule** table: Control appearance = the component library's theme | Layout = utility-CSS | Typography non-library = utility-CSS tokens
3. **Strictly forbidden list**: component-library layout wrappers (e.g. `Box`/`Stack`/`Grid`), hardcoded hex, inline style objects, duplicate style-prop colors
4. **Codebase anchors**: exact file paths + existing hooks/schemas referenced
5. **Smart vs Dumb rule** (one sentence each; per the `lego-philosophy` skill)
6. **Component map** (mermaid flowchart: orchestrator → smart → dumb chain)
7. **One step per major component** with:
   - Exact TypeScript interface (every field, including all schema fields)
   - Markup layout snippet (utility classes, no hex)
   - Mutation / hook wiring
   - Edge cases (empty state, loading, errors)

### Precision standard

Each step must be **prompt-like**: a developer should be able to implement it with zero ambiguity. If you write "render a form", rewrite as "render `<div className="space-y-4">` containing `<TextField label="First Name" ...>` + `<TextField label="Last Name" ...>` in `<div className="grid grid-cols-2 gap-4">`, then `<PhoneInput ...>`, then address fields" — using the project's actual shared primitives.

### Shared primitives (Step 1 always)

New shared primitives in the shared UI package are always Step 1 — they are the foundation everything else builds on. Each primitive:
- Wraps a component-library control (not a competing UI library)
- Zero style-prop colors — the theme covers it
- Maps semantic props (`variant="primary"`) to the library's `variant`+`color`
- Layout via utility-CSS `<div>` only

---

## Phase 4: Final Validation Pass

After the plan is written, run this checklist against EVERY component in the plan:

### Schema completeness
- For every form component: list all fields in the plan's interface → grep the corresponding validation schema → verify every schema field appears in the interface
- Mismatch = add missing fields before proceeding

### Token compliance
- Grep plan text for `#[0-9a-fA-F]{3,6}` — any match is a violation
- Replace with the theme's utility tokens (e.g. `text-primary`, `bg-secondary`, `text-secondary/60`)
- Exception: dynamic-size style props for programmatic values are acceptable

### UX state coverage
- Every section card needs both `onEdit` (filled state) and `onAdd` (empty state) documented
- Every form dialog needs: loading state, error state, success toast, seed-on-open effect

### Field name alignment
- Check interface field names match the RPC/API mutation input names exactly (e.g. `phoneNumber` not `phone`)
- Check constants are exported from the right file (a feature `constants.ts`, not inline)

### Privacy / compliance
- All sensitive-data-displaying mutations have the audit middleware
- Error messages are generic (no user enumeration)

### Fix in plan before declaring done
Any gap found in Phase 4 must be fixed in the plan using `StrReplace`. Re-run the checklist after each fix.

---

## Validation report format

End Phase 4 with this summary to the user:

```
## Final Validation Report

### N issues found and fixed

**Critical #1 — [title]**
[What was wrong, what schema/design node confirmed it, what was changed]

**UX #2 — [title]**
[What was wrong, what was changed]

### All N design nodes confirmed accounted for
[Table: Node | Content | Plan coverage]
```

---

## Quick reference: token mapping

Build this table from the project's actual design system / theme (read the theme module + utility config). It maps each design value to the named token the plan must use instead of a raw value. Example shape:

| Utility class | Value |
|---|---|
| `text-primary` / `bg-primary` | `<brand primary hex>` |
| `text-secondary` / `bg-secondary` | `<dark neutral hex>` |
| `text-secondary/87` | `<dark neutral at 87% opacity>` |
| `text-secondary/60` | `<dark neutral at 60% opacity>` |
| `font-display` | `<display font>` |
| `font-body` | `<body font>` |

---

## Related skills

- **Downstream implementation**: `implement-designs` — consumes the Final Validation Report from this skill and runs the Explorer/Analyzer/Coder/Reviewer team to land code.
- **Component conventions**: `frontend-component-conventions` — the component-library + utility-CSS hybrid rules this plan applies.
- **Feature-level wiring**: `react-frontend-developer` — page-level data/routing/context the plan's smart containers will use.
- **Mobile audit**: `mobile-friendly-checker` — Phase 4 token/breakpoint/touch-target validation.
- **Architecture lens**: `principal-architect` — escalate compliance/clean-arch concerns surfaced by the schema gap analysis.
- **Knowledge**: `memory-first`, `memory-validator` — Phase 0 context load and post-plan alignment check.
