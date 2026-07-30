---
name: implement-designs
description: Use when the user provides a design-tool URL (e.g. a Figma figma.com/design/… or figma.com/make/… link), asks to implement designs, convert a screen to code, do a pixel-perfect UI pass, or mentions "design-to-code". Config-driven: reads ${design.figma}, ${frontend.frameworks}, ${frontend.styling}, ${frontend.apps}, ${memory.store}, ${commands.*}, and ${testing.e2e.*} from .claude/stack.md; no-ops when ${design.figma} is none. Implements designs pixel-perfect in the project's frontend apps using the component-library + utility-CSS hybrid, one shared theme, and maximum reuse of shared UI primitives, orchestrated by an Explorer/Analyzer/Coder/Reviewer subagent team. For upstream plan-and-validate (schemas, AC, gap analysis) use figma-plan-and-validate first; the Scope boundaries table inside routes neighboring needs.
---

# Implement Designs from a Design Tool

Converts designs to production frontend code using **the component library for controls, the utility-CSS framework for layout** with **one shared theme** and **maximum reuse** of the project's shared UI primitives.

Core principle: the design system is the source of truth. The design tool cannot override the component library's theme — if a design conflicts, adjust the theme centrally, never re-skin per component.

Work is orchestrated by a four-role subagent team so design output lands on existing primitives instead of producing one-off components.

> **Read `.claude/stack.md` first.** Use its values; never assume a specific tool. Read `${design.figma}`
> (the design tool, e.g. figma — or `none`), `${frontend.frameworks}`, `${frontend.styling}`,
> `${frontend.apps}`, `${memory.store}`, `${commands.*}`, and `${testing.e2e.*}`. If `${design.figma}` is
> **`none`**, this skill is a **no-op** — there is no configured design tool to import from, so ask the user to
> paste a screenshot/spec or run `frontend-component-conventions` directly, and stop. If a needed capability is
> otherwise `none`/empty, skip those steps. If `.claude/stack.md` is missing, run the **`onboard`** skill and
> stop. Concrete tools named below (Figma + its MCP, MUI, Tailwind, Playwright) are **examples** — match the
> configured stack.

> **Coverage gate (mandatory) — audit EVERY design, read EVERY spec page in full.** Never sample. Before any
> Coder work:
> - **All designs, not a few.** Enumerate every design node / frame / screen / variant / link the user provided
>   (and every child frame the metadata reveals), then audit **all** of them — empty, filled, error, loading,
>   hover, focus states included. No "representative subset", no "the main screens", no stopping at the first few.
>   If the input spans multiple screens, run the auto-spawn sequence once per screen (batch the design-tool MCP
>   calls in small groups for API sanity, but cover the whole set). The context window is large (~1M) — the full
>   design set fits; breadth is the default, not an optimization to defer.
> - **Whole Confluence/spec pages.** When the ticket links Confluence or other spec pages (via
>   `figma-plan-and-validate` upstream or the AC gate), read each linked page **in full** — the entire page body
>   plus the ticket description and **all** comments — never an excerpt, summary, or first-section skim. Fetch the
>   complete page (e.g. `getConfluencePage` whole body) and fold every AC item into the Design Brief. A linked
>   page left unread, or read only partially, BLOCKS the coverage gate.

> **Lessons gate (mandatory) — ask the knowledge store, never hardcode.** Before the Coder writes anything, the
> parent MUST query the project's knowledge/memory store (`${memory.store}`) for lessons relevant to this screen
> and fold them into the Design Brief as binding constraints — load via the **`memory-first`** skill with the
> screen/feature name, target app, and touched domains. The knowledge store is the single source of truth for
> lessons; this skill mandates the lookup, it does not restate any lesson. If `${memory.store}` is `none`, read
> the project's `.claude/` notes instead. Apply whatever the store returns.

---

## Scope boundaries — when to use this skill vs others

| Need | Skill |
|---|---|
| Design → code (this skill) | `implement-designs` |
| Plan + schema validation before implementing | `figma-plan-and-validate` → then `implement-designs` |
| Edit design-tool nodes / write designs into the tool | the design tool's own write skill (e.g. Figma `use_figma`) |
| Build a screen from a description into the design tool | the design tool's generate-design skill |
| Build a design system library in the design tool | the design tool's generate-library skill |
| Map codebase components to the design tool's code-connect | the design tool's code-connect skill |
| Component-library + utility-CSS conventions (forms, mobile, theme) | `frontend-component-conventions` |
| Mobile audit on added screens | `mobile-friendly-checker` |
| Bug fix during implementation | `devfix` |

---

## Subagent team — Explorer / Analyzer / Coder / Reviewer

Spawned automatically by the parent via the Task tool. Parent owns design-tool MCP calls (it's the only node with access), the knowledge store, and session-level reconciliation.

**All agent output uses caveman mode (full).** Drop articles, filler, hedging, pleasantries. Fragments OK. Technical terms exact. Code blocks unchanged. Pattern: `[thing] [action] [reason]. [next step].` Every subagent prompt below includes this mandate.

Agents are defined in `.claude/agents/` and auto-discovered. Spawn by name.

| Role | Agent name | Mode | Owns |
|---|---|---|---|
| **Explorer** | `context-scout` | read-only | Enumerate existing primitives/pages/pattern usage in the shared UI package, target app, and nearby features; return a reuse map |
| **Analyzer** | `analyzer` | read-only | Map design-tool output (screenshot + design-context code + variable/token defs) to concrete shared UI primitives + theme tokens + utility classes; flag gaps (primitive missing, token missing, schema mismatch) |
| **Coder** | `coder` | read/write | Implement components following the Analyzer's mapping; start with any new shared primitives, then dumb components, then smart containers |
| **Reviewer** | `reviewer` | read-only (comments) | Verdict: pixel-perfect vs screenshot, compliance with every lesson returned by the knowledge-store lookup, hybrid-rule compliance, no hardcoded hex, no library layout wrappers, mobile-first correctness, reuse score, touch-target pass |

Fallback: `resolver` for narrow typecheck/lint repairs after Coder; the parent runs long `${commands.typecheck} && ${commands.lint} && ${commands.build}` itself via Bash.

### Auto-spawn sequence

1. **Parent, Phase 1**: fetch design-tool context (design context, screenshot, variable/token defs, metadata for every node). In parallel spawn **Explorer** to produce the reuse map. Parent also loads the knowledge store via `memory-first`.
2. **Parent, Phase 2**: merge design artifacts + Explorer reuse map into a **Design Brief** (see below). Spawn **Analyzer** with the Design Brief; expect a mapping report back.
3. **Parent, Phase 3**: spawn **Coder** with Design Brief v2 (Analyzer mapping attached). Parent reviews the diff as it lands.
4. **Parent, Phase 4**: after `${commands.typecheck} && ${commands.lint} && ${commands.build}` pass locally (parent via Bash), spawn **Reviewer** with Design Brief v3 + diff + screenshot. If verdict = `request_changes` → re-spawn Coder (max 2 rounds).
5. **Parent, Phase 5**: writeback to the knowledge store.

### The Design Brief (shared artifact)

The parent maintains a single markdown blob and passes the current version into each subagent prompt. Subagents do not edit it; only the parent appends.

```markdown
# Design Brief — <screen name>

## Design source
fileKey:   <...>
nodeIds:   [<...>]
screenshot: <saved path or inline ref>

## Tokens (from the design tool's variable/token defs)
colors:    [<brand primary>, <dark neutral>, ...]
typography:[<display font>, <body font>]
spacing:   [8, 16, 24, 32, ...]

## Code hints (from the design tool's design-context)
<reference markup output — NOT final code>

## Local Code Connect registry
<Design-tool component → codebase component mappings read from the project's code-connect files.
Explorer must scan these files and populate this section BEFORE Analyzer runs.
Format: DesignComponentURL → shared-ui/<component> (props hint)>

## Schema / AC (from figma-plan-and-validate if upstream)
<schema fields, RPC/API input, AC states>

## Explorer reuse map
primitives_available: [...]
similar_pages:        [path: why similar]
existing_theme_tokens:[what's already in the theme]
duplicate_risks:      [where Coder might recreate an existing thing]

## Analyzer mapping (v<n>)
per_node:
  - design_node:      <name>
    target_primitive: <shared-ui path or new primitive>
    library_base:     <component-library component if not from shared-ui>
    utility_classes:  <...>
    theme_gap:        <none | add X to the theme>
    schema_fields:    <tied to schema/RPC input>
    states:           [default, hover, focus, error, empty, loading]

## Visual Inventory (parent — from screenshot, Phase 1)
containers:
  - selector: "<description of container>"
    direction: row | col
    gap:       <utility class, e.g. gap-1>
    padding:   <utility class, e.g. px-4 py-6>
text_elements:
  - name:      "<element description>"
    font:      <display | body family>
    size:      <utility class, e.g. text-xl sm:text-4xl>
    weight:    <font-semibold | font-normal | ...>
    color:     <utility class, e.g. text-primary/87>
    tracking:  <utility class>
    leading:   <utility class>
token_gaps:
  - design_value: "<e.g. 34px>"
    nearest_token: "<e.g. text-4xl = 36px>"
    action:    use-nearest | add-token
    deviation: "<e.g. 2px — acceptable>"

## Coder report (round <n>)
files_changed:     [...]
new_primitives:    [...]
theme_changes:     [...]
notes:             decisions, deviations

## Reviewer report (round <n>)
verdict:           approve | request_changes | block
findings:          [...]
pixel_perfect:     true | false
mobile_first:      true | false
reuse_score:       high | medium | low
```

### Output contracts

**Explorer → parent** (YAML)
```yaml
primitives_available: [...]   # shared UI exports
local_code_connect:           # from the project's code-connect files
  - design_url:  "<design-tool component url>"
    component:   "shared-ui/<component>"
    props_hint:  "variant, size, label, loading, disabled"
similar_pages:        [...]   # nearest existing implementations
existing_theme_tokens: [...]  # theme palette/typography currently defined
duplicate_risks:      [...]   # things Coder is likely to recreate
```

**Analyzer → parent** (YAML)
```yaml
mapping:
  - design_node: ...
    target:    shared-ui/<name> | new primitive | <app>/components/<name>
    library_base:  Button|TextField|... | none
    utility:   "flex flex-col gap-4 ..."
    theme_changes_needed: []
    schema_fields: []
    states:    [default, hover, focus, error, empty, loading]
gaps:
  missing_primitives: []
  missing_theme_tokens: []
  schema_mismatches: []
coder_brief: |
  MANDATORY — LEGO philosophy: Before any markup, invoke the `lego-philosophy` skill (single source of truth for the smart/dumb split + shared inventory).
  Ask "does a shared/primitive component already exist for this?" If yes, reuse it — never recreate.
  Order: 1) shared primitives (if any) 2) dumb components 3) smart containers.
  Dumb = props-only, no RPC/API, no context. Smart = one concern, almost no JSX, passes flat props to dumb children.
  No raw <div> stacking as a starting point — every repeating visual pattern is a named dumb component.
  No-go: component-library layout wrappers, inline style objects, hardcoded hex, library Typography for structure.
  Red flags: 3+ nested anonymous divs, copied classNames, icon+label div, card div without a shared wrapper.
```

**Coder → parent** (YAML)
```yaml
files_changed:   [...]
new_primitives:  [...]
theme_changes:   [...]
notes: |
  Decisions, any deviations from Analyzer mapping (with reason)
reviewer_focus:  [areas for pixel-perfect / mobile checks]
```

**Reviewer → parent** (YAML)
```yaml
verdict:          approve | request_changes | block
findings:
  - severity:     critical|major|minor
    file:         ...
    issue:        ...
    suggestion:   ...
pixel_perfect:    true | false   # vs the design tool's screenshot
mobile_first:     true | false   # grid-cols-1 sm:..., touch >=44px, 320px smoke
reuse_score:      high | medium | low
hybrid_compliant: true | false   # library controls, utility-CSS layout, no mixed violations
```

---

## Design-tool MCP playbook

Parent (not subagents) calls these. Always check each tool's descriptor before calling. (Examples use a Figma MCP; substitute the configured design tool's equivalents.)

| Tool (example) | When | Notes |
|---|---|---|
| `get_design_context` | **Every node** — primary | Returns reference markup + screenshot + hints. Treat code as reference, not final. |
| `get_screenshot` | **MANDATORY every node** — pixel-perfect reference | Parent MUST `curl -o docs/design/<feature-key>/<nodeId>.png "<url>"` immediately and add the path to the Design Brief. The URL is short-lived; download once. Reviewer reads this PNG file (multimodal) and compares against a captured screenshot of the running app. Skipping this step is the #1 source of design drift escaping review — text-only inspection misses label position, label visibility, icon style, spacing, etc. |
| `get_variable_defs` | Token extraction | Produces the `colors / typography / spacing` rows of the Design Brief. |
| `get_metadata` | When a node's response is sparse | Returns sub-layer IDs → recurse with `get_design_context` on each. |
| `search_design_system` | When aligning with an existing library | Returns available component instances to map against the shared UI package. |
| code-connect tools | Optional — UI kits only | On some plans these only return hits for public UI kits, not custom components. Safe to call; expect no hits for the project's own components. |
| `whoami` | Once per session for debugging | Confirms design-tool auth / scope. |

**Fallback when the design-tool MCP is blocked.** If `get_design_context` / `get_screenshot` return an access/seat/rate-limit error (some design tools cap MCP read calls by seat), do **NOT** skip the screenshot. Fall back to the design tool's REST API with a personal access token if it offers one — it is typically not bound by the MCP seat cap and honours normal file permissions:

1. Require the design tool's access token in env (e.g. `FIGMA_ACCESS_TOKEN` for Figma, with read scopes for file content + dev resources). If unset, ask the user to export it (suggest the in-session `! export …` form) or to paste the screenshot. **Never hardcode, log, or echo the token.**
2. PNG (replaces `get_screenshot`) — example with Figma's REST API (node id is colon-form in the API, dash-form in URLs):
   ```bash
   IMG_URL=$(curl -s -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" \
     "https://api.figma.com/v1/images/<fileKey>?ids=<nodeId>&format=png&scale=2" \
     | python3 -c "import sys,json;print(json.load(sys.stdin)['images']['<nodeId>'])")
   curl -o docs/design/<feature-key>/<nodeId>.png "$IMG_URL"
   ```
3. Node document (replaces design-context / token defs):
   ```bash
   curl -s -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" \
     "https://api.figma.com/v1/files/<fileKey>/nodes?ids=<nodeId>" > docs/design/<feature-key>/<nodeId>.json
   ```
4. Build the Visual Inventory + Design Brief from the downloaded PNG + JSON exactly as on the MCP path. If even the REST token returns 403/404 the file is genuinely unshared — ask the user to share it or paste the screenshot; only then proceed against an approved in-repo **sibling component** as ground truth, flagging any un-verifiable copy as `unverified`. The mandatory image-vs-image diff in Phase 4 still applies — use the token-downloaded PNG as the baseline.

URL parsing (Figma example):
- `figma.com/design/:fileKey/:fileName?node-id=1-2` → `fileKey`, `nodeId = "1:2"` (convert `-` to `:`).
- `figma.com/design/:fileKey/branch/:branchKey/...` → use `branchKey` as `fileKey`.
- `figma.com/make/:makeFileKey/...` → use `makeFileKey`.
- `figma.com/board/:fileKey/...` → FigJam file, use the board tool.

Batch calls in groups of 3–4 nodes to stay within context limits.

---

## Phase 0 — Load context (MANDATORY before design-tool calls)

Parent-only:

1. **Knowledge store**: load via `memory-first` (`${memory.store}`) — feature area, past screens, past primitives. If `none`, read `.claude/` notes.
2. **Read single-source-of-truth files**:
   - The shared theme module (one per monorepo). Read every existing palette key before proceeding.
   - The utility-CSS config (tokens and breakpoints).
   - The shared UI package's exported primitives.
3. **Reference implementation**: read a known-good existing component that already follows the hybrid pattern, to anchor the style.
4. **Shared-component inventory** (MANDATORY): before any design fetch, list the shared primitives:
   ```bash
   find <shared-ui-dir> -name "<PrimitivePrefix>*.tsx" | sort
   ```
   Read each found file's props interface. The Explorer subagent will deepen this inventory, but the parent must have the list before spawning Analyzer.
5. **Asset download** (when the design contains images/icons/SVGs): run the project's design-asset export script automatically — do not ask the user. If the project has no such script, use the design tool's REST API to download new assets to the appropriate `assets/` folder before Coder runs. Never reference a design-tool asset URL directly in component code.

   **CRITICAL — asset identity rule.** Variable names like `imgX` in design-context output are derived from layer names inside master components and **do not reliably match** what you intend to save as `<filename>.png`. A variable called `imgCardFront` may resolve to a different image depending on how the master component was authored.
   - Export by **component master node id**, not by `imgX` variable name. Get master node ids from `get_metadata` on the parent frame, or from the node-id attributes inside the inline component definitions in design-context output.
   - For every new asset filename, verify the rendered PNG matches its filename's intent — render the page in the browser and visually confirm. A typecheck pass is not enough; mismatched assets compile fine and ship visual regressions.
   - Retry-with-backoff is mandatory in the export script — design-tool image CDNs time out intermittently. Wrap downloads in a timeout and retry at least 3 times before failing.
   - Export at retina scale (e.g. `scale=3`) unless the design system says otherwise.
   - The export script must accept `--force` to overwrite existing files. "Already exists" is not a reason to skip — assets may exist but be wrong.
   - Add the export-script invocation and any node-id → filename mapping changes to the Coder report's `notes` field so Reviewer can re-run on `--force` when something looks off.

If `figma-plan-and-validate` already ran upstream, import its plan and its **Final Validation Report** into the Design Brief — skip Phase 0's schema re-verification and go straight to Phase 1.

---

## HARD GATE — Worktree / Batch dispatch mode

When `implement-designs` is triggered from a batch flow (`batch-from-image`, `devfix`, or any flow that dispatches **multiple worktree coder agents** for design-linked issues), the parent MUST complete ALL of the following BEFORE spawning ANY coder agent. No exceptions. No "the agent can fetch the design later" — worktree coder agents have Bash/Read/Edit/Write ONLY. They CANNOT call the design-tool MCP.

### Pre-spawn checklist (parent blocks until all done)

1. **Design screenshots to disk** — For every design-tool URL in every tracker ticket in the batch:
   - Call the design tool's `get_screenshot`
   - `curl -o docs/design/<issue-key>/<nodeId>.png "<url>"` immediately (URLs expire)
   - Call `get_design_context` for the same node
   - Save output to `docs/design/<issue-key>/<nodeId>.md`
   - Read the PNG with the Read tool and produce a Visual Inventory (containers, text elements, spacing)

2. **Code Connect registry** — Run once for the batch: scan the project's code-connect files and the shared primitives:
   ```bash
   find <shared-ui-dir> -name "*.figma.tsx" -o -name "<PrimitivePrefix>*.tsx" | sort
   ```
   Read each file. Build the mapping: DesignComponentURL → codebase component (props hint). Save to `docs/design/CODE_CONNECT_REGISTRY.md`.

3. **Shared-component inventory** — Run once:
   ```bash
   find <shared-ui-dir> -name "<PrimitivePrefix>*.tsx" | sort
   ```
   Read each file's props interface. Save to `docs/design/COMPONENT_INVENTORY.md`.

4. **Include in every coder agent prompt**:
   - File paths to the design screenshots and design-context markdown for that agent's issues
   - Path to `CODE_CONNECT_REGISTRY.md`
   - Path to `COMPONENT_INVENTORY.md`
   - Visual Inventory section (containers, text, spacing from screenshot analysis)
   - Explicit instruction: "Read the design screenshot PNG with the Read tool before writing any code"

5. **Post-merge visual E2E** — After all worktree agents complete and merge (only if `${testing.e2e.runner}` ≠ none):
   - For each design-linked issue, generate an e2e visual scenario
   - Capture the running-app screenshot, Read both PNGs (design baseline + app render)
   - Flag drift before push

**If any design-tool URL fails to fetch, do NOT dispatch the coder for that issue.** Report to user and skip. Partial context produces drift that's harder to fix than a skipped issue.

---

## Phase 1 — Fetch design context + Explorer in parallel

### HARD RULE — full design context to disk BEFORE any code edit

For every node listed in the user's request, the parent MUST persist three artifacts to disk under `docs/design/<feature-key>/<nodeId>.{md,png}` BEFORE the Coder is spawned and BEFORE any source file is edited. No exceptions, no "implement-as-you-fetch", no skipping nodes "for budget":

1. **`docs/design/<feature-key>/<nodeId>.md`** — wraps the full output of `get_design_context` (reference markup, hints) AND the output of `get_variable_defs` (colors, typography, spacing) for that node. Use markdown fences so the brief stays machine-readable.
2. **`docs/design/<feature-key>/<nodeId>.png`** — `curl -o` the URL returned by `get_screenshot` immediately (URLs are short-lived; one download per fresh URL).
3. **`docs/design/<feature-key>/AUDIT.md`** — one section per node with: dimensions, key tokens used, layout structure (single-col / 2-col / stacked), interactive elements present, mobile vs desktop variant, and a 1-line summary.

`<feature-key>` is the tracker epic or short slug (e.g. `${issueTracker.keyPrefix}-727`, `checkout-v2`). The `docs/design/` folder is committed to the repo — do not add it to `.gitignore`.

Batching: parent fetches in groups of 3–4 nodes per assistant message to stay within context. If the feature has > 8 nodes, dispatch a single read-only fetcher subagent (general-purpose) to walk the list, save all artifacts, and return only the AUDIT.md contents. The fetcher is the only tool with design-tool MCP authority in that case.

The audit step is non-negotiable because the parent and downstream subagents cannot trust their text-only impression of design-context output. The audit forces a screenshot-vs-text reconciliation up front, which is what catches drift like split-color titles, inner panels, side-icon modals, and 2-col grids that the reference code structure obscures.

If the user reports "doesn't match the design" / "drift" / "inconsistency" mid-session, the recovery path is to re-run this whole phase from scratch — do not patch from memory.

Parent calls design-tool MCP tools per the playbook. Spawn Explorer at the same time — it needs no design data, only repo context. Its job is to return the reuse map so the Analyzer doesn't redo the work.

### MANDATORY — Visual Inventory (parent reads screenshot before Coder)

After downloading `docs/design/<feature-key>/<nodeId>.png`, the parent **MUST** open the PNG with the Read tool and produce a **Visual Inventory** section in the Design Brief. This step happens in Phase 1, not Phase 4 — by the time the Reviewer sees drift, the Coder has already made wrong choices.

For every container visible in the screenshot, record:
- flex direction, gap between children, internal padding

For every text element (heading, subtitle, label, helper text), record:
- font family (display / body), size token, weight, color token, tracking, line-height

For every spacing value that does not map exactly to a utility token, record:
- the design value, the nearest token, and whether to use-nearest or add-token

Add all of this as the `## Visual Inventory` section in the Design Brief **before** spawning Coder. The Coder prompt must reference it explicitly — "follow the Visual Inventory for all gap, padding, and typography classes."

> **Why Phase 1, not Phase 4.** Design-context text often omits gaps between elements, assigns wrong font families, and silently approximates sizes. The parent reading the screenshot catches these before the Coder hardcodes arbitrary values.

Explorer prompt template:

> **Caveman mode (full).** Drop articles, filler, hedging. Fragments OK. Technical terms exact.
>
> Read-only. Map surface area reusable for `<feature/screen name>` at the target app under `${frontend.apps}`. Return the reuse map in the Explorer → parent YAML contract from this skill's Output contracts section. Focus on: (1) every shared primitive under the shared UI package — check props and usage, not just names; (2) **scan every code-connect file** (e.g. `*.figma.tsx`) — extract the design component URL and the mapped codebase component + props from each `connect(...)` call; return these as the `local_code_connect` list so the parent can populate `## Local Code Connect registry`; (3) 2–3 nearest existing pages/features; (4) every palette key and typography token already defined in the theme — list them so Analyzer can map design colors to existing tokens; (5) duplicate risks — where Coder is most likely to recreate an existing shared component or introduce a new hardcoded color. Thoroughness: medium.

---

## Phase 2 — Analyzer mapping

Parent merges design context + Explorer + knowledge store into Design Brief v1. Spawns Analyzer with Design Brief v1.

Analyzer prompt template:

> **Caveman mode (full).** Drop articles, filler, hedging. Fragments OK. Technical terms exact. Code blocks unchanged.
>
> Read-only. Analyzer role. Given Design Brief below, produce node-by-node mapping from design nodes to concrete shared UI primitives or theme + utility-class lists. Flag missing primitives, missing theme tokens, schema mismatches. Return the YAML contract (`mapping`, `gaps`, `coder_brief`). Obey the hybrid rule: component library for controls, utility-CSS for layout. Reject any plan that uses the component library's layout wrappers or inline style objects.
>
> **Local Code Connect registry is the source of truth for component mapping.** If the Design Brief `## Local Code Connect registry` section has an entry whose design URL matches a node you are mapping, use that codebase component as `target_primitive` — do not re-derive it. Only fall back to your own mapping when no registry entry covers the node.
>
> <Design Brief v1>

---

## Phase 3 — Coder implementation

Parent writes Design Brief v2 (Analyzer mapping attached). Spawns Coder.

Coder prompt template:

> **Caveman mode (full).** Drop articles, filler, hedging. Fragments OK. Technical terms exact. Code blocks unchanged.
>
> Coder role. Implement mapping in Design Brief. Follow the project's frontend conventions: component-library controls + utility-CSS layout, the shared theme provider, the form library's binding wrapper for any form field, mobile-first (`grid-cols-1 sm:...`), no inline style objects, no inline arrow functions as JSX props, no component-library layout wrappers/`Typography` for structure.
>
> **Pre-flight — spacing and typography** (do this BEFORE writing any markup): For every flex/grid container you are about to write, state the gap and padding utility classes from the Visual Inventory in the Design Brief. For every text element, state the font family, size token, weight, tracking, and line-height token from the Visual Inventory. If a value from the inventory has no matching token, either use the nearest documented token (record the deviation) or add a named token to the utility config first. Never skip this step and never silently use an arbitrary value (`text-[34px]`, `tracking-[0.25px]`, `gap-[13px]`).
>
> **Color rule**: every color must come from the theme's palette tokens or a utility class that maps to the theme. Never introduce a raw hex string anywhere in component code, style props, or CSS modules. If a design color has no matching token, add it to the theme first.
>
> **Spacing rule**: all spacing must use the theme spacing scale or utility spacing classes that map to the theme (`gap-4`, `px-6`, `mt-8`). Never use arbitrary utility spacing values (`px-[13px]`, `mt-[22px]`), hardcoded pixel values in style props, or magic numbers in inline styles. If the design specifies a spacing value with no matching step, round to the nearest step or add a new named spacing token to the theme first.
>
> **Typography rule**: all font sizes, weights, line heights, and font families must come from the theme typography tokens or utility typography classes that map to the theme (`text-sm`, `font-semibold`). Never hardcode `fontSize`, `fontWeight`, `lineHeight`, or `fontFamily` as raw values in style props or inline styles. If a design text style has no matching token, add it to the theme's typography section first.
>
> **Shared-first rule**: before writing a new component, confirm there is no existing shared primitive that covers the need. The Explorer reuse map in the Design Brief is your first check; also run the inventory `find` for completeness.
>
> **Fix-on-sight rule**: while reading or editing any file in the touched package, if you encounter an existing violation (hardcoded hex, arbitrary spacing, raw typography value, component-library layout wrapper for structure, inline arrow function in JSX prop) — fix it immediately as part of this task. Add the fix to `files_changed` with a `fix_on_sight: true` flag so the Reviewer knows to re-inspect those files.
>
> Implementation order (mandatory):
> 1. **New theme tokens** if Analyzer flagged missing ones — colors, spacing steps, typography variants only; extend existing palette/typography/spacing objects, never override them inline.
> 2. **Shared primitives** if Analyzer flagged missing ones.
> 3. **Code Connect file** for every new shared primitive (e.g. `<component-name>.figma.tsx` next to the component). Map every significant prop via the code-connect helpers matching design property names. If the actual design component key is not yet known, use a placeholder URL — the file must exist so Explorer registers it. **This step is mandatory — never ship a new primitive without its code-connect sibling.**
> 4. **Stories** for every new or modified primitive (e.g. `<ComponentName>.stories.tsx`), following the existing story pattern. Include at minimum a `Default` story and one per meaningful variant/state.
> 5. **Dumb components** under the app's `components/<feature>/` or the shared UI package if reusable.
> 6. **Smart containers** under the app's `pages/...` wiring data/RPC/router.
>
> **Deviation rule**: when the design specifies something that conflicts with project conventions (a hex not in the theme, a spacing value not in the scale, a component the design system doesn't have), do NOT silently approximate — document the deviation in the `notes` field and in a code comment at the deviation site.

 After edits, run `${commands.typecheck} && ${commands.lint}` in the touched package. Return the YAML contract (`files_changed`, `new_primitives`, `theme_changes`, `storybook_stories`, `reviewer_focus`).
>
> <Design Brief v2>

Coder uses the `coder` agent because implement-designs is net-new implementation; `resolver` is repair-focused and reserved for narrow post-Coder fixes. If Coder is blocked on a large refactor, parent can fall back to the original workflow serially.

---

## Phase 4 — Reviewer verdict

### MANDATORY visual diff (parent does this BEFORE spawning Reviewer)

Text-only inspection misses ~80% of design drift (label position, label visibility, icon style, spacing). Every Phase 4 must include a real image-vs-image comparison:

1. Confirm the design screenshot was downloaded in Phase 1: `ls docs/design/<feature-key>/<nodeId>.png` exists and is non-empty. If not, re-download via `curl -o` (re-call `get_screenshot` for a fresh URL — they expire).
2. Capture the running app's rendering of the implemented screen (only if `${testing.e2e.runner}` ≠ none; use the project's e2e screenshot capability, `${testing.e2e.*}`). Default shape:
   ```bash
   <e2e-screenshot-cmd> --full-page --viewport-size=1280,800 \
     "http://localhost:<port><route>" \
     "assets/rendered-screenshots/<feature>-<timestamp>.png"
   ```
   If the local stack is not up, the parent must start it (or instruct the user) before continuing — do not skip this step. If there is no e2e screenshot tool, capture the rendering another way (browser screenshot) — do not skip the image diff.
3. **Read both PNG files with the Read tool** (Claude is multimodal; the Read tool returns image content). Diff them mentally for: label position, label visibility, icon style, padding/spacing, ordering, button shape, color tokens. Capture every drift.
   - **Also check explicitly for layout-shell regressions** that have nothing to do with design drift: duplicate headers, duplicate footers, duplicate titles, stacked breadcrumbs, two copies of the same CTA. These usually mean the page added a layout element that the route's parent wrapper (`*Route.tsx`, `Layout.tsx`, etc.) already renders. The design reference will not flag this; only the rendered PNG will. Treat any duplicate as a blocking finding.
4. If drift exists, append findings to the Design Brief under `Reviewer report` BEFORE spawning Reviewer (or skip the spawn and re-run Coder directly — the parent's eyes have already done the review at this point).

> **Why this is mandatory.** Without reading the actual rendered PNG, Coder reports "matches the design" based on the spec text, but the user finds drift the moment they open the page in a browser. The fix is for the parent to do the visual diff every time, not to trust subagent self-reports.

After visual diff + tests/typecheck/lint are green:

> **Caveman mode (full).** Drop articles, filler, hedging. Fragments OK. Technical terms exact. Code blocks unchanged.
>
> Reviewer role (read-only — report findings, do not edit; fixes are applied by Coder round 2 or `resolver`). Verify against the design tool's screenshot + hybrid rules. For every violation found, return a finding with exact `file:line` and a `suggestion` containing the precise remediation noted per check below — the goal is a findings list the Coder can apply mechanically.
>
> Run these grep checks on all new/changed files (and their neighbors in the same feature folder):
> (a) pixel-perfect layout vs screenshot — flag layout drift; remediation via theme tokens, not arbitrary values
> (b) `grid-cols-1 sm:...` and touch targets ≥44px
> (c) **Color** — `grep -rn '#[0-9a-fA-F]\{3,6\}'` — any hit: extract to the theme palette and replace
> (d) **Spacing** — grep for `\[.*px\]`/`\[.*rem\]` arbitrary utility classes and raw `'Npx'` in style props — any hit: map to nearest theme step or add token, then replace
> (e) **Typography** — grep for raw `fontSize`/`fontWeight`/`lineHeight`/`fontFamily` in style props/inline style outside the theme, and `text-\[` arbitrary sizes — any hit: move to the theme typography, then replace
> (f) **Structure** — component-library layout wrappers/`Typography` used for layout — replace with utility-CSS equivalents
> (g) **Shared-first** — if an existing shared primitive should have been used but wasn't, refactor to use it
> (h) **Stories** — every new or modified primitive has a stories sibling — create missing ones
> (i) **Assets** — no design-tool URLs in code — download assets and replace URL with local import
> (j) **Asset identity** — for each `<filename>.png` referenced in newly-touched components, open the file (or render the page) and confirm the image content matches the filename. If it doesn't, the export script mapped node ids by `imgX` variable name instead of by component master node id — re-run with the corrected mapping and `--force`.
>
> Then return the YAML verdict:
> - `approve` — all checks green, zero findings
> - `request_changes` — findings present; parent re-spawns Coder with them attached
> - `block` — fundamentally wrong architecture that requires parent-level decision (e.g. wrong app target, wrong data layer)
>
> <Design Brief v3>

On `request_changes`, parent re-spawns Coder once (round 2) with findings attached. Max 2 Coder rounds before escalating.

---

## Phase 5 — Writeback and verification

Parent runs:

- `${commands.typecheck} && ${commands.lint}` in the touched package (again, clean).
- Any knowledge-graph/index refresh the project uses so its tooling reflects the new components.
- Optional `${commands.test}` for the touched package.
- Use `mobile-friendly-checker` for a final mobile audit on the added screens.
- Writeback via `memory-first` (`${memory.store}`): record the mapping decisions, any new primitives, theme token additions, so the next session's Explorer can surface them. If `${memory.store}` is `none`, append to `.claude/` notes.

---

## Phase 6 — Verification checklist

- [ ] Design Brief exists and every design node is covered
- [ ] **Full design context persisted to disk BEFORE any code edit**: every node has a `docs/design/<feature-key>/<nodeId>.md` (design context + token defs) AND a `docs/design/<feature-key>/<nodeId>.png` (screenshot) AND `docs/design/<feature-key>/AUDIT.md` exists. No node was implemented from text-only impression.
- [ ] Explorer scanned all code-connect files and populated `## Local Code Connect registry` in Design Brief
- [ ] Analyzer used registry entries as-is for matched nodes — no re-derivation
- [ ] Shared-component inventory checked before any new component was created; existing primitives reused
- [ ] New components only when Analyzer confirmed no shared primitive fits
- [ ] Theme extended centrally for any missing color/typography before Coder wrote component code
- [ ] Every form field wrapped in the form library's binding wrapper with `error` + `helperText`
- [ ] Component library used only for controls; utility-CSS owns all layout and structure
- [ ] No `Box`/`Stack`/`Grid`/`Container`-style layout wrappers (component-library layout wrappers) for structure
- [ ] No hardcoded hex (`grep '#[0-9a-fA-F]{3,6}'` returns nothing new in any new/changed file)
- [ ] No hardcoded spacing — no arbitrary `[Npx]`/`[Nrem]` utility classes, no raw pixel strings in style props
- [ ] No hardcoded typography — no raw `fontSize`/`fontWeight`/`lineHeight`/`fontFamily` in style props or inline style outside the theme; no `text-[Npx]` arbitrary sizes
- [ ] Any missing color/spacing/typography tokens added to the theme before component code was written
- [ ] Every new shared primitive has a stories sibling with `Default` + variant stories
- [ ] Every new shared primitive has a code-connect sibling (props mapped from the TypeScript interface; URL can be a placeholder until the design key is confirmed)
- [ ] Any design assets (images, SVGs, icons) downloaded locally via the project's export script or the design tool's REST API — no design-tool asset URLs in code
- [ ] Asset identity verified: every newly-saved `<filename>.png` was opened or rendered and visually matches its filename's intent. Export scripts must map by component master node id, not by `imgX` variable name, and must support `--force` + retry-with-backoff.
- [ ] No inline style objects, no inline arrow functions as JSX props
- [ ] Mobile-first breakpoints (`grid-cols-1 sm:...`, `px-4 sm:px-6`, `text-2xl sm:...`)
- [ ] Touch targets ≥ 44px on interactive elements
- [ ] 320px and 375px smoke test passes (no horizontal scroll)
- [ ] `${commands.typecheck} && ${commands.lint} && ${commands.build}` pass for every touched package
- [ ] **Mandatory visual diff performed**: design screenshot PNG downloaded, running-app PNG captured, both Read with the Read tool, drift report attached to Design Brief. Skipping this step is a hard fail.
- [ ] Reviewer verdict = `approve`
- [ ] Knowledge-store writeback complete

---

## Anti-patterns (Reviewer blocks on these)

- **Ignoring local Code Connect registry** — if a code-connect entry maps a design URL to a codebase component and Analyzer mapped it to something else, Reviewer blocks with `severity: critical`.
- Creating a custom component when a shared primitive fits — Coder must run the inventory check before writing new code.
- Hardcoding hex values anywhere outside the theme — including style props, inline style, CSS modules, and arbitrary utility values like `text-[#ff0000]`.
- Hardcoding spacing as arbitrary utility values (`px-[13px]`, `mt-[22px]`) or raw strings in style props — use the theme spacing scale or standard utility steps.
- Hardcoding typography values (`fontSize: '13px'`, raw `fontWeight: 600` in style props, or `text-[13px]`) — use theme typography variants or utility typography classes.
- Adding any design token (color, spacing step, text style) to a component without first defining it in the theme.
- Using component-library layout wrappers or `Typography` for layout/structure.
- A raw hex in a style prop (e.g. `sx={{ color: '#ff0000' }}`) — use theme tokens or utility classes.
- Inline style objects for anything other than runtime-computed sizing that can't be expressed as a utility class.
- Inline arrow functions in JSX props (`onClick={() => ...}`) — extract with a memoized callback.
- Ignoring the screenshot — **mandatory** image-vs-image diff in Phase 4.
- Trusting subagent self-reports of "matches the design" without the parent reading both PNG files. Subagents have no design-tool MCP and cannot see the rendered app; only the parent's image-Read step catches drift.
- Skipping the Explorer phase and letting Coder pick primitives from guessed memory.
- Creating a new shared primitive without a stories sibling file.
- Creating a new shared primitive without a code-connect sibling file — use a placeholder URL if the actual key is not yet known, but the file must exist so Explorer can include it in the registry.
- Referencing design-tool asset URLs in component code — all images/SVGs must be downloaded locally first.
- Introducing a new icon library to satisfy a design icon that isn't in the project — map to the nearest existing icon or add the SVG as a local asset instead.
- Creating placeholder content (grey boxes, lorem ipsum, fake images) when the actual asset is available or downloadable — always use real content.

---

## Related skills

- **Upstream planning**: `figma-plan-and-validate` — produces the schema-validated plan this skill implements; its Final Validation Report plugs directly into the Design Brief.
- **Conventions**: `frontend-component-conventions` — authoritative rules for the component-library + utility-CSS hybrid, theme, forms, mobile-first, single framework-instance test setup.
- **Feature wiring**: `react-frontend-developer` — page-level data/routing/context wiring that composes the components this skill produces.
- **Mobile audit**: `mobile-friendly-checker` — run in Phase 5 on the added screens.
- **Verification**: `double-check-code`, `run-tests`, `generate-tests-after-implementation`.
- **Architecture lens** (when Reviewer flags structural issues): `principal-architect`.
- **If bug fix during impl**: hand off to `devfix` (same Analyzer/Coder/Reviewer team, different outputs).
- **Knowledge**: `memory-first`, `the-journalist` for Phase 5 writeback; `memory-validator` to confirm alignment with stored design decisions.
- **Subagents** (defined in `.claude/agents/`): Explorer=`context-scout`, Analyzer=`analyzer`, Coder=`coder`, Reviewer=`reviewer`; fallback `resolver`.
