---
name: devfix
description: Use when the user invokes devfix, bugfix, gherkinfix, or issuefix; or provides an issue key/URL with a bug description.
---

# Devfix

Fix bugs end-to-end **test-first**: validate intent → **ask the project memory store for lessons** → pull issue-tracker + docs ACs → **write the failing test that reproduces the bug (RED)** → implement the minimal fix (GREEN) → refactor → test → review → push → **store the new lesson**. Land the fix — never end with plans or pseudocode.

> **Read `.claude/stack.md` first; use its values; never assume a specific tool.** If a needed capability is `none`, skip those steps. If the config is missing, run the `onboard` skill and stop.
>
> Every concrete tool named below is only a **parenthetical example**. The actual issue tracker comes from `${issueTracker.tool}` (e.g. Jira, GitHub Issues, Linear), the docs source from its linked pages (e.g. Confluence), the memory/knowledge store from `${memory.store}` (e.g. Qdrant), the test-management sync from `${testing.testManagement}` (e.g. Zephyr), the runners from `${testing.*}`, commands from `${commands.*}`, branch model from `${vcs.*}`, design source from `${design.figma}`, and CI/deploy from `${ci.*}`.

## TDD discipline — RED before GREEN (MANDATORY, the Iron Law)

This skill is **rigid TDD**. The bug fix is driven by a failing test, never the other way around.

```
NO PRODUCTION-CODE FIX WITHOUT A FAILING TEST FIRST
```

- **RED first.** For every AC / test-management case / bug symptom, write the unit + Gherkin test that *reproduces the bug*, run it, and capture the **failing** output. A bug fix with no test that failed first is not done — it is unverified.
- **Watch it fail for the right reason.** The captured failure must be the bug's symptom (wrong value, wrong branch, missing guard), **not** a typo, import error, or compile error. A test that errors instead of failing, or fails for the wrong reason, is not a valid RED — fix the test and re-run until it fails correctly.
- **GREEN second.** Only after a valid RED may production code change. Write the **minimal** root-cause fix to turn the captured RED green — no extra features, no untouched-code refactors (YAGNI).
- **REFACTOR under green.** Clean up only while every test stays green; add no new behavior.
- **Never weaken to pass.** Making a test green by deleting/relaxing an assertion, adding `@skip`, or narrowing AC is a hard violation — escalate instead.

The RED evidence is a first-class artifact: it lives in the Coder report and is gated by **CHECKPOINT-2-RED** before any GREEN production diff is accepted.

> If `${integrations.superpowers}`, invoke `superpowers:test-driven-development` to drive this RED→GREEN→REFACTOR discipline (and `superpowers:systematic-debugging` when diagnosing the failing symptom / a RED that fails for the wrong reason) — see `skills/shared/superpowers-integration.md`. Otherwise the Iron-Law checkpoints above remain authoritative.

## Lesson loop — ask + store project memory (MANDATORY)

Lessons live in the configured memory/knowledge store `${memory.store}` (e.g. Qdrant) as the single source of truth — never hardcode lesson text into this skill or any other. If `${memory.store}` is `none`, skip both sides of this loop. Otherwise both sides fire on every devfix:

**START — ask (read).** Before changing code, query `${memory.store}` for relevant lessons and apply them as binding constraints (e.g. a `memory_search` / `memory_facts`-style call) with the issue key, bug keywords, and touched file/domain terms.

**END — store (write).** The fix is **not done** until the new lesson is saved:

```
CHECKPOINT LESSON-LOOP
  REQUIRES: a memory_store-style write to ${memory.store} with root cause, wrong→right behavior,
            and the guard that prevents recurrence (type incident|pattern, the project's memory
            scope/collection, importance ≥ 0.6). Update an existing memory instead of duplicating.
  ON FAIL: do not report the fix complete; store the lesson first.
  SKIP WHEN: ${memory.store} is none.
```

## When to apply
- User says **devfix / /bugfix / /gherkinfix / /issuefix**
- Issue-tracker link/key present in prompt
- Bug touches the project's test files (e.g. `*.{feature,steps.ts}` under `${testing.e2e.dir}`)
- User says **double check** + an issue key/URL → run **Phase DC only** (see below)

---

## CHECKPOINT PROTOCOL

Every phase ends with a named checkpoint. **The next phase MUST NOT start until the parent explicitly verifies the checkpoint passes.** No subagent may proceed past a failed checkpoint. If a checkpoint cannot be cleared, escalate to the user.

```
CHECKPOINT <name>
  REQUIRES: <what must be true>
  BLOCKED BY: <what causes failure>
  ON FAIL: <action>
```

---

## Phase DC — Double-Check (standalone audit, no code changes)

**Trigger:** user says "double check <issue key>" or "double check <issue-url>".

Read `.claude/skills/shared/phase-dc.md` and execute it exactly — it owns DC-0/DC-1/DC-2 and CHECKPOINT-DC (shared with `implement`; the audit is identical for bugs and features). On `verdict: fail` + user confirming "fix now" → continue with full devfix (Phase 0 onward).

---

## Phase 0 — Issue tracker + linked docs + test-management

All references below to a specific tracker, docs tool, or test-management tool are **examples** — use whatever `${issueTracker.tool}`, its linked-docs source, and `${testing.testManagement}` resolve to. Skip any source that is `none`.

Dispatch all in **one message** (parallel):
1. Fetch the current issue from `${issueTracker.tool}` — Description, Comments, parent/epic field (e.g. Jira `getJiraIssue`).
2. Fetch the parent issue + remote/linked issues on both issue and parent (e.g. Jira `getJiraIssueRemoteIssueLinks`).
3. Fetch every linked docs page found in links AND comments (e.g. Confluence `getConfluencePage`). If the tracker has no linked-docs tool, skip.
4. **Test-management cases (`${testing.testManagement}`, e.g. Zephyr Scale via its MCP)** — fetch every linked test case for the issue or its parent/story. Look for the project's test-case tag references (the `${testing.e2e.tagConvention}` form, e.g. `@TestCaseKey=<PREFIX>-T###`) in remote links, docs pages, and the issue itself. List each test case's name, key, and Gherkin steps. If `${testing.testManagement}` is `none`, skip.
5. Extract:
   - All Gherkin/ACs from Description **and** every docs page → Team Briefing `## Docs ACs`
   - Every linked test-management case (key + Gherkin) → Team Briefing `## Test-management coverage`
   - Identify the **story key** (Epic or parent story, e.g. `<PREFIX>-###`) — this drives the test-management folder under `${testing.e2e.dir}` (e.g. `<features>/phase2/<STORY-KEY>/<tm>/`) that Coder will use in Phase 2.
6. **Design-link harvest (mandatory when docs pages fetched and `${design.figma}` is enabled).** Across every fetched docs page (current + parent chain + linked), regex out every design-tool URL (e.g. for Figma: `https?://(www\.)?figma\.com/(design|proto|board|file|make)/[^\s)"'<>]+`). For each match:
   - Parse the file key from the path and the node id from `?node-id=...` (convert `-` → `:` for Figma).
   - Capture the nearest preceding heading / paragraph as `contextHeading` (≤120 chars).
   - Dedupe by `fileKey:nodeId` (or by file key alone when no node id).
   - Classify each link as **relevant** (contextHeading mentions the issue key, an AC section, or the active story) or **candidate** (everything else — old iterations, parents, "see also").
   - Write the table into Team Briefing `## Design links` with columns: `url | fileKey | nodeId | contextHeading | relevant?`.
   - Pass only the **relevant** set to downstream design-tool calls (e.g. Figma `get_design_context`, `get_screenshot`) when the Coder/Analyzer phase needs visual ground truth. Cache results by `fileKey:nodeId` for the session — never re-fetch the same node twice. List the candidates so the user can promote any on demand.
   - If `${design.figma}` is disabled, or no design URLs found across all pages: write `## Design links` with `none found` / `n/a` — do not silently skip.

Rules:
- Issue Description Gherkin → implement in repo, run to pass (not docs-only)
- Docs ACs → same bar as the issue Gherkin (authoritative)
- Test-management cases → same bar; each test-case tag must end up as a runnable Gherkin scenario tagged with the key
- Issue tracker wins over docs on conflict; docs win over test-management; note all conflicts in Team Briefing
- If the issue-tracker connector is unavailable: note it explicitly, continue with user prompt + repo context only
- If the test-management connector is unavailable or no cases linked: write `## Test-management coverage` with explicit `none found` — do not silently skip

```
CHECKPOINT-0: ISSUE_AND_DOCS_AND_TEST_MANAGEMENT
  REQUIRES:
    - issue fetch result present in Team Briefing
    - All linked docs pages fetched (or explicitly noted as unavailable / none)
    - ## Docs ACs section populated with at least one entry (or "none found")
    - ## Test-management coverage section populated with every linked test-case tag (or explicit "none found" / n/a)
    - ## Design links section populated (table of harvested design URLs with fileKey/nodeId/contextHeading/relevant flag, or explicit "none found" / n/a)
    - Story key identified (drives the test-management folder path in Phase 2)
    - Every AC labelled: covered (file:line) | gap | not-yet-tested
    - Every test-management case labelled: covered (feature:line) | gap | not-yet-tested
  BLOCKED BY:
    - issue fetch failed and no fallback context provided
    - docs pages linked in comments not fetched
    - docs pages fetched but design URLs not harvested into ## Design links (when ${design.figma} enabled)
    - test-management connector available but not queried
    - ## Docs ACs or ## Test-management coverage section missing from Team Briefing
  ON FAIL: Re-fetch missing resources; do not spawn Analyzer or Phase 1 MCPs until clear
```

---

## Phase 1 — Memory / knowledge-store validation

Dispatch in **parallel** with Analyzer subagent against the configured store `${memory.store}` (e.g. Qdrant). The calls below are the project's equivalents (a structured-facts call, a semantic-memory search, a requirements/knowledge search, a recent-points list). **All are mandatory when `${memory.store}` is set; if it is `none`, skip this whole phase and note it.**

| Capability | Calls (examples) |
|-----|-------|
| Memory | structured-facts call (always, e.g. `memory_facts`); semantic memory search ×2 (e.g. `memory_search`) — query 1: issue key, query 2: feature/area keyword, top_k≥5 each |
| Requirements / knowledge | requirements search ×2 with different queries (e.g. `qdrant-find`); recent-points list, limit≥5 (e.g. `qdrant-log`); broader semantic search ×1+ (e.g. `semantic_search`) |

```
CHECKPOINT-1: MEMORY_VALIDATION
  REQUIRES:
    - structured-facts result present
    - semantic memory search ×2 results present (both queries)
    - requirements search ×2 results present
    - recent-points list result present
    - broader semantic search ×1+ result present
    - Validation summary written to Team Briefing ## Phase 1
  BLOCKED BY:
    - Any of the calls missing (unavailable store must be noted, not silently skipped)
  ON FAIL: Re-dispatch missing calls; do not spawn Coder until clear
  SKIP WHEN: ${memory.store} is none (note it in Team Briefing ## Phase 1)
```

---

## Phase 1.5 — Analyzer

Before spawning the Analyzer (`context-scout`), if the project has a code-graph/indexing CLI (the `graphify`-style tool configured for this repo), run it to load graph context for the bug area; if there is no such tool, skip and note it:

```bash
# Example, if the project ships a code-graph CLI:
graphify query "<bug-area keyword — e.g. registration email check>"
# If a specific file/function is already known from Phase 1 results:
graphify path "<source-symbol>" "<target-symbol>"
```

Include the output in the Team Briefing `## Code-graph context` section and pass it to both agents below so they can navigate to affected modules without scanning the whole tree.

This is the **designed two-stage chain** — each agent does the job it was built for, the parent routing the first's output into the second:

1. **`context-scout`** (read-only) — maps the **touched surface**: git diff, file dependency graph, architecture-layer violations, import direction, per-file test-coverage map. Inputs: Team Briefing v1 + code-graph context. Returns a structured `touched_surface` report.
2. **`analyzer`** (read-only impact analyst) — **consumes the harvested AC + the context-scout touched-surface report** and produces the impact assessment: blast radius, compliance/Clean-Arch/data-access risk (e.g. PHI/HIPAA + RLS, only where the project's domain applies per `${backend.platform}`), **scope-creep detection**, design-component identification, and the synthesized **Coder brief** (files/lines + no-go list + required test surface). Inputs: harvested AC + context-scout output + code-graph context.

Write context-scout's map to `## Touched surface` and analyzer's output to `## Analyzer report`.

```
CHECKPOINT-1.5: ANALYZER
  REQUIRES:
    - code-graph query executed for the bug area (mandatory when the project ships such a CLI — else note "no code-graph CLI")
    - ## Code-graph context section present in Team Briefing (with output, or the explicit "no CLI" note)
    - context-scout ran first → ## Touched surface present (diff + dep graph + layer-violation + test-coverage map)
    - analyzer ran on context-scout output → ## Analyzer report present
    - scope (file list) populated
    - blast_radius: low | med | high
    - risks assessed (even if all low) incl. scope_drift_detected
    - coder_brief present with specific files and line numbers + no-go list
  BLOCKED BY:
    - code-graph CLI exists but skipped without an explicit note
    - analyzer spawned without a context-scout touched-surface report to consume
    - Analyzer returned no file list
    - coder_brief is generic ("fix the bug") with no specifics
  ON FAIL: Re-spawn the missing stage with a targeted prompt; do not spawn Coder until clear
```

---

## Phase 2 — Coder (TDD: RED → GREEN → REFACTOR)

Spawn `coder` agent. Inputs: Team Briefing (Docs ACs + Test-management coverage + Analyzer coder_brief).

Owns: **failing tests first (RED)**, then root-cause fix (GREEN), then refactor — **targeted tests at both levels (unit + E2E Gherkin)**. No assertion weakening. The Coder works the RED→GREEN→REFACTOR cycle internally and returns **both** the captured RED evidence and the GREEN diff; the parent gates RED before accepting GREEN.

### Step RED — write the failing tests first (no production code yet)

**MANDATORY — Test coverage from the issue + docs + test-management, written BEFORE the fix.** Coder MUST produce, and run to a captured **failing** result, before touching any production code:
1. **Unit tests** for every AC in `## Docs ACs` and every Gherkin block in the issue Description — one assertion per AC clause, at the layer where the logic lives (backend domain/use-case, frontend hook/util, validation schema). Unit coverage is mandatory even when E2E exists. Use the unit runner `${testing.unit.runner}`.
2. **Gherkin scenarios** for every entry in `## Test-management coverage` AND every docs Gherkin block — only when `${testing.e2e.runner}` ≠ none. Each test-management case (the `${testing.e2e.tagConvention}` tag, e.g. `@TestCaseKey=<PREFIX>-T###`) MUST become a runnable `.feature` scenario tagged with that key so `${testing.testManagement}` can report execution back.

Each new/updated test MUST be **run and observed to fail** against the current (buggy) code. Coder captures the verbatim failing output into `red_evidence` (per AC: command, failing assertion, why it is the bug's symptom and not a typo/compile error). A test that passes immediately on unchanged code does not reproduce the bug — rewrite it until it fails for the right reason.

> The design-truth, LEGO, and design-system-mapping mandates below apply to the **GREEN** step (production/UI changes). Honor them when implementing the fix, not while writing RED tests.

**Test-management folder layout (mandatory when `${testing.testManagement}` ≠ none):** for any work driven by a story (Epic or parent story key found in Phase 0, e.g. `<PREFIX>-###`), Coder MUST create / extend the test-management folder under `${testing.e2e.dir}`:

```
${testing.e2e.dir}/<features>/phase2/<STORY-KEY>/<tm>/
  └── <PREFIX-T###>-<short-slug>.feature   # one file per test-management case
```
(`<tm>` is a folder named for `${testing.testManagement}`, e.g. `zephyr`.)

Rules for the test-management folder:
- One `.feature` file per test-management case; filename starts with the test-case key.
- Each scenario carries its `${testing.e2e.tagConvention}` tag verbatim (e.g. `@TestCaseKey=<PREFIX>-T###`) for execution sync.
- Reuse existing step definitions under `${testing.e2e.dir}` first; only add new steps when an existing one cannot be reused. Never duplicate steps.
- Reuse tag-driven hooks (e.g. an `@anon-registration`-style setup tag) instead of inventing per-scenario setup steps. Add new hooks in the E2E scenario-hooks file under `${testing.e2e.dir}` when a setup pattern repeats.
- If a test-management case targets a flow already covered by an existing scenario elsewhere, instead of copying it: extend that scenario with the test-case tag and leave the test-management file as a thin alias **only when the case is genuinely identical**; otherwise write a new scenario in the test-management folder.

**Design-truth protocol — invoked by bug nature, not link presence (be smart). Applies only when `${design.figma}` is enabled.**

devfix decides whether the design pipeline is needed from **what the bug actually is**, not merely from whether a design link is attached to the ticket. First classify the fix and write `## Design relevance` to the Team Briefing:

- **`design_relevant: yes`** — the fix changes a **rendered surface's appearance**: visual regression, spacing/layout, color, typography, iconography, on-screen copy, component variant, responsive/viewport breakage, or "doesn't match the design". These need design ground truth.
- **`design_relevant: no`** — the fix is **behavior/logic/data/backend**: wrong calculation, broken validation, API error, state/race bug, permission/data-access, copy that is data-driven not design-driven, a unit-level branch. A rendered surface is touched only incidentally, with no appearance change.

Gate the pipeline on the classification (skip the whole pipeline when `${design.figma}` is disabled):

| `design_relevant` | relevant design links? | Action |
|---|---|---|
| yes | yes | **Run the `implement-designs` design pipeline before Coder** (mandatory — steps below). Non-negotiable: text-only design-context summaries hallucinate colors, spacing, icons, layout. |
| yes | no | **Ask the user for the design URL** ("this looks design-related — paste the design node so the fix matches the design"). Only proceed against an in-repo sibling component as ground truth if the user has none, flagging unverifiable copy as `unverified`. |
| no | yes or no | **Skip the design pipeline** — note `## Design relevance: no — <one-line reason>`. Do not burn design-tool calls or screenshots on a logic/backend bug just because a link exists. |

When the table says **run the pipeline**, the parent executes these steps **before** spawning Coder (the #1 source of design drift is skipping screenshots). Calls/paths below are for Figma as the example design tool (`${design.figma}`); adapt to the configured tool:
1. **Screenshot** every relevant design node (e.g. Figma `get_screenshot`). Download immediately to a per-issue design folder:
   ```bash
   curl -o docs/design/<issue-key>/<nodeId>.png "<screenshot URL>"
   ```
   URLs expire — one download per call. If the file is empty or missing, re-request the screenshot.
2. **Visual Inventory** — parent reads each screenshot (multimodal) and records per container: background color, border, border-radius, padding, font family/size/weight, icon identity (icon name or asset URL), gap between children. Write this into Team Briefing `## Visual Inventory`.
3. **Asset export** — for any icon or image in the design that differs from what's in the repo, download the asset via the design tool's asset URLs or the project's design-export scripts. Place in the correct `assets/` folder. Never reference a design-CDN URL directly in component code — those expire.
4. **Pass to Coder** — the Coder prompt MUST include the Visual Inventory (concrete values, not "match the design") and the local paths to downloaded screenshots + assets. Coder implements against these, not against remembered design context.

**Fallback — design-tool REST API with a personal access token (when the MCP/connector is blocked).** If the design-tool calls return `"could not be accessed"`, a seat/rate-limit error, or the file sits on a plan the connector login can't read, do **NOT** silently skip the screenshot. Fall back to the design tool's REST API with a personal access token — it is typically **not** bound by the connector seat/monthly cap and honours normal file permissions. Figma example:

1. Require a `FIGMA_ACCESS_TOKEN` (or the equivalent for the configured design tool) in the env (for Figma: Settings → Security → Personal access tokens, scopes `file_content:read` + `file_dev_resources:read`). If unset, ask the user to export it (suggest `! export …` so it lands in-session) or to paste the screenshot directly. **Never hardcode, log, or echo the token.**
2. Render the node to PNG and download it (Figma node id is colon-form `10023:130424` in the API, dash-form `10023-130424` in URLs):
   ```bash
   IMG_URL=$(curl -s -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" \
     "https://api.figma.com/v1/images/<fileKey>?ids=<nodeId>&format=png&scale=2" \
     | python3 -c "import sys,json;print(json.load(sys.stdin)['images']['<nodeId>'])")
   curl -o docs/design/<issue-key>/<nodeId>.png "$IMG_URL"
   ```
3. For exact tokens (spacing, colors, typography, layout) fetch the node document:
   ```bash
   curl -s -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" \
     "https://api.figma.com/v1/files/<fileKey>/nodes?ids=<nodeId>" > docs/design/<issue-key>/<nodeId>.json
   ```
4. Build the Visual Inventory from the downloaded PNG + JSON exactly as on the connector path. If even the REST token returns 403/404 the file is genuinely unshared — ask the user to share it or paste the screenshot; only then may the parent proceed against an approved in-repo **sibling component** as ground truth, flagging any un-verifiable copy as `unverified`.

```
CHECKPOINT-2-DESIGN: DESIGN_TRUTH
  REQUIRES (only when ${design.figma} enabled AND ## Design relevance is design_relevant: yes):
    - design-tool screenshot called for every relevant design node
    - Screenshots downloaded to docs/design/<key>/<nodeId>.png (non-empty files)
    - Visual Inventory present in Team Briefing with concrete values per container
    - Asset URLs downloaded to local assets/ folder (no design-CDN refs in code)
  BLOCKED BY:
    - design_relevant: yes with relevant links but the pipeline was skipped
    - design_relevant: yes but no design URL and the user was not asked for one
    - Any relevant design node without a downloaded screenshot
    - Coder prompt that says "match the design" without concrete color/spacing/font values
    - Component code referencing a design-CDN asset URL
  ON FAIL: Re-run the screenshot call; if the connector stays blocked (access/seat/rate-limit), use the REST-API token fallback above; rebuild Visual Inventory; do not spawn Coder until clear
  SKIP WHEN: ${design.figma} is disabled; OR ## Design relevance is design_relevant: no (logic/behavior/backend bug) — even if design links exist; OR ## Design links is "none found" for a non-design fix
```

### Step GREEN → REFACTOR — implement the minimal fix, then clean up

Only after a valid RED (every required test captured failing for the right reason): write the **minimal** root-cause fix that turns the RED tests green. No features beyond AC, no refactors of untouched code. Re-run the previously-failing tests and confirm they now pass (capture the GREEN output). Then refactor only while staying green. The design-truth/LEGO/design-system-mapping mandates below apply to this step.

**MANDATORY — component-reuse ("LEGO") philosophy (frontend changes only; honor the project's frontend conventions):** Before writing any UI markup, Coder MUST:
1. Invoke the `lego-philosophy` skill (the single source of truth for the smart/dumb split + component inventory).
2. Ask: "Does a shared/design-system component already exist for this?" — if yes, reuse it.
3. No raw container stacking as a starting point. Every repeating visual pattern is a named dumb component.
4. Dumb components: props-only, no data-fetching, no context. Smart components: one concern, almost no markup.
5. Red flags that require stopping and refactoring: 3+ levels of nested anonymous containers, copied style classNames across files (e.g. `${frontend.styling}` utility classes such as Tailwind), inline icon+label combos, inline styles.
Violating these rules is a CHECKPOINT-2-GREEN blocker — Coder report must confirm the reuse check was done. (Applies only when the project has a frontend; skip for backend-only stacks.)

**MANDATORY — design-system mapping update (when shared/design-system components are created or modified; only when `${design.figma}` provides such a mapping, e.g. Figma Code Connect):**
Design-system mapping files (e.g. Code Connect `*.figma.tsx` in the shared-components package) map shared components to design-system nodes. When Coder creates a new shared component or modifies props/variants of an existing one:
1. Check if a corresponding mapping file exists (e.g. a `<component>.figma.tsx` for that component).
2. If yes — update it to reflect new props, variants, or renamed exports.
3. If a new shared component is created — create a matching mapping file following the pattern of existing ones. Use the design tool's code-connect helpers if available (e.g. Figma `get_code_connect_map` / `get_code_connect_suggestions`).
4. Run the project's mapping-validation command if configured (e.g. `npx figma connect publish --dry-run`).
The mapping config lives in the shared-components package (e.g. a `figma.config.json`). Skip this whole mandate when `${design.figma}` is disabled or the project has no such design-system mapping.

```
CHECKPOINT-2-RED: FAILING-TEST-FIRST
  REQUIRES:
    - red_evidence present in Team Briefing ## Coder report
    - One captured FAILING test run per Docs AC and per issue Gherkin block (exact command + failing assertion output)
    - One captured FAILING run for every test-management case scenario (or "none found" stated)
    - Each failure is the bug's symptom (wrong value/branch/missing guard) — NOT a typo, import, or compile error
    - No production-code change is justified by RED alone (RED diff is test files only; the only allowed non-test edits are new test scaffolding/fixtures)
  BLOCKED BY:
    - Any AC / test-management case with no captured failing test
    - A test that ERRORED instead of failing, or passed immediately on unchanged code (does not reproduce the bug)
    - Production source already mutated before a valid RED exists for that change
    - red_evidence missing or asserting "will fail" without captured output
  ON FAIL: Re-spawn Coder: "Write the test that reproduces the bug and capture it failing for the right reason before any fix." Do not accept GREEN until clear.
```

**Parent verification after Coder returns (GREEN):**
- Confirm CHECKPOINT-2-RED passed first — every accepted production change traces to a test that failed before it
- Read every changed file and confirm diff matches `diff_summary`
- Confirm the previously-RED tests now pass (green_evidence in report)
- Confirm the test-management folder contains one `.feature` per test-management case (or that `## Test-management coverage` was "none found")
- If diff does not match or files are missing → re-spawn Coder round 2

```
CHECKPOINT-2-GREEN: CODER
  REQUIRES:
    - CHECKPOINT-2-RED passed (failing tests captured first for every AC / test-management case)
    - CHECKPOINT-2-DESIGN passed (when ${design.figma} enabled AND design_relevant: yes) — screenshots downloaded, Visual Inventory in briefing
    - diff_summary present in Team Briefing ## Coder report
    - Parent has read actual changed files and confirmed diff matches summary
    - green_evidence present: every RED test now passes (captured output), turned green by a minimal root-cause fix
    - Unit tests added/updated for every Docs AC and every issue Gherkin block (Coder report lists test-file:line per AC)
    - Gherkin scenarios added/updated for every test-management case under ${testing.e2e.dir}/<features>/phase2/<STORY-KEY>/<tm>/ (or "none found" stated)
    - Every new scenario carries its ${testing.e2e.tagConvention} tag verbatim (e.g. @TestCaseKey=<PREFIX>-T###)
    - No assertion weakening detected in diff (a RED that went green by relaxing/removing an assertion or @skip is a hard block, not a pass)
    - Fix is minimal — no features beyond AC, no refactors of untouched code (YAGNI)
    - No design-CDN URLs in component code (assets must be local)
    - `${commands.typecheck}` passes (Coder must run it; output must appear in report)
  BLOCKED BY:
    - CHECKPOINT-2-RED not passed
    - CHECKPOINT-2-DESIGN not passed when ${design.figma} enabled and design_relevant: yes
    - diff_summary missing or vague
    - Parent has not verified actual files (cannot take Coder's word alone)
    - green_evidence missing — fix claimed but RED tests not shown going green
    - A previously-RED test made green by weakening/removing an assertion or adding @skip
    - Docs AC without a matching unit test
    - test-management case without a matching .feature scenario under the test-management folder
    - Missing test-case tag on a test-management-derived scenario
    - typecheck output absent from Coder report
    - Assertion weakening detected
    - design-CDN asset URL found in any changed component file
  ON FAIL: Re-spawn Coder; if round 2 still fails → Resolver
```

---

## Phase 3 — Coverage pre-check + Tester

**Phase 3 pre-check — `coverage-auditor` (read-only gap detector).** Before/alongside the Tester, spawn `coverage-auditor`. It consumes the harvested AC + the context-scout touched-surface map and reports what is **covered vs missing**: missing `.feature` files, missing/diverged Gherkin blocks, and changed-files-with-no-unit-test gaps. Write its report to Team Briefing `## Coverage audit`. Any gap it finds is fed to the Tester (must turn into a real failing assertion, never an infra-skip) and, if the gap is a missing test the Coder should have written, back to Resolver. This runs concurrently with the Tester (both read-only of app source) — the parent reconciles both before CHECKPOINT-3.

Spawn `tester` agent **AND** `coverage-auditor` **AND** parent runs `${commands.typecheck} && ${commands.lint}` in parallel — all mandatory.

**Tester MUST execute all applicable suites using the project's commands** (substitute `${commands.*}` / `${testing.*}`; examples shown in parentheses use pnpm + Playwright):
- Typecheck: `${commands.typecheck}` scoped to the changed package (e.g. `pnpm --filter <app> typecheck`)
- Unit: the unit runner `${testing.unit.runner}` scoped to the changed package (e.g. `pnpm --filter <app> test run`)
- API/integration BDD: the API-test command (only if API steps changed; e.g. `pnpm --dir tests/api-tests test`)
- UI-E2E (mandatory when `${testing.e2e.runner}` ≠ none) — run from `${testing.e2e.dir}`, filtered to the issue's `${testing.e2e.tagConvention}` tag:
  ```bash
  cd ${testing.e2e.dir} && ${testing.e2e.bddStep} && <e2e run command> <feature path> --reporter=list --grep "<issue tag, e.g. @<PREFIX>-<key>>"
  # (e.g. cd tests/ui-tests && pnpm exec bddgen && pnpm exec playwright test e2e/features/<path>.feature --reporter=list --grep "@<PREFIX>-<key>")
  ```
  ⚠️ **Never run the BDD-generation step from repo root** — it requires `${testing.e2e.dir}` as cwd (the runner config lives there).
  ⚠️ **Runner "second time" / duplicate-dependency crash** → run the package manager's dedupe (e.g. `pnpm dedupe`) from repo root first, then retry. Never infra-skip without attempting dedupe.

**Parent also MUST run `double-check-code` skill** after Tester passes — this is mandatory, not optional.

### Phase 3α — Live render check (MANDATORY for UI-touching diffs)

Read `.claude/skills/shared/phase-live-render.md` and execute it exactly — screenshot every touched route in the running app and **Read the PNGs** (CHECKPOINT-3α applies as written there). Backend-only diffs skip.

All suites run in parallel with `run_in_background: true`. Report must include the **exact command run** and **raw tail output with timing** for each suite. File existence checks and grep are not test execution.

**Tester also MUST:**
- Check every `## Docs ACs` entry → `covered (file:line)` or `gap`
- Check every `## Test-management coverage` entry → `covered (feature:line, scenario green)` or `gap`
- A `gap` in either section = `verdict: fail`
- Return `verdict: skip` only with a fully-populated `phase_3a_block`

**Final-gate rule (non-negotiable):** read `.claude/skills/shared/green-gate.md` and execute it — it is the single source of truth for "green". Every stream MUST be green before CHECKPOINT-3 passes:
1. **Unit tests** — the **full** unit suite green, every package (not only the changed one)
2. **E2E** — the **full** E2E suite green via `${testing.e2e.runner}`, run from `${testing.e2e.dir}` with no `--grep`. The issue-tagged and changed scenarios are the iteration loop; the whole suite is the gate. If `${testing.e2e.runner}` is `none`, the green gate's absent-harness branch fires — make the `scaffold-test-projects` offer (Gherkin + page objects + typed web-element wrappers + hooks) and record `suggested-scaffold`; do **not** silently skip
3. **Test-management** — every test-management-tagged scenario under `${testing.e2e.dir}/<features>/phase2/<STORY-KEY>/<tm>/` green (run with `--grep` on the test-case tag, e.g. `@TestCaseKey=<PREFIX>-T`, or the union of the specific keys) — skip when `${testing.testManagement}` is none

If any applicable stream is red or missing, verdict is fail. No partial passes. Tester's `green_gate` block goes into Team Briefing `## Green gate`.

```
CHECKPOINT-3: TESTER
  REQUIRES:
    - ## Coverage audit present (coverage-auditor ran); every gap it found is either covered by a green test or routed to Resolver — no open gap silently shipped
    - Report contains exact shell command + raw output (pass/fail counts, timing) for EVERY suite
    - UI-E2E suite executed via ${testing.e2e.runner} --grep on the issue tag (mandatory when ≠ none — package-manager dedupe to fix version conflicts first)
    - Test-management E2E suite executed: --grep on the test-case tag (e.g. @TestCaseKey=<PREFIX>-T<keys>) against the story's test-management folder; raw output in report (skip when ${testing.testManagement} is none)
    - double-check-code skill run by parent (mandatory)
    - CHECKPOINT-GREEN passed (skills/shared/green-gate.md) — ## Green gate present with the green_gate block
    - Unit tests: FULL suite green (every package, no --filter), command + raw output in report
    - E2E: FULL suite green (no --grep), command + raw output in report — or absent harness recorded as suggested-scaffold with the offer made
    - Test-management: every scenario under <STORY-KEY>/<tm>/ tagged with its test-case tag green (or test-management none)
    - All Docs ACs: covered (file:line) — no gaps
    - All test-management cases: covered (feature:line) — no gaps
    - Phase 3α LIVE RENDER passed for every UI-touching route (or N/A for backend-only diffs)
    - verdict: pass
  BLOCKED BY:
    - Any suite missing from report (grep/file-check substitutes not accepted)
    - UI-E2E or test-management E2E not executed when applicable (infra-skip only accepted after a dedupe attempt fails)
    - Full-suite gate silently narrowed to the tag-filtered iteration run
    - ${testing.unit.runner} or ${testing.e2e.runner} is none and the scaffold offer was not made
    - double-check-code not run
    - verdict: pass with suites marked skip and no phase_3a_block
    - Any Docs AC or test-management case gap
    - Any failing unit / E2E / test-management scenario
  ON FAIL:
    - Missing runner output → re-spawn Tester: "Run the commands. File checks do not count."
    - Failing test, likely_owner=coder → re-spawn Coder round 2 → re-Tester
    - Failing test, likely_owner=tester → re-spawn Tester (tests only); max 2 rounds
    - Failing test, likely_owner=infra → package-manager dedupe then retry; if still failing → explicit Phase 3a skip with block
    - AC gap or test-management coverage gap → Resolver to add missing coverage → re-Tester
  DO NOT spawn the Reviewer panel until CHECKPOINT-3 passes
```

---

## Phase 3.5 — Reviewer panel (concurrent, unanimous)

Not one reviewer — a **panel spawned all at once in a single message** (true concurrency). Each seat reviews the same diff + Team Briefing through a **distinct lens** so the seats catch different failure modes. The parent is the **coordinator**: it collects every seat's verdict and decides. **The gate is unanimous — 100% of seats must `approve`.** A single dissent blocks the push.

Panel seats (all spawned together, comments only):

| Seat | Agent | Lens |
|---|---|---|
| **A — Clean Code** | `clean-code-reviewer` | SOLID, DRY, KISS, YAGNI, naming, function_size, comments |
| **B — Architecture & Security/Compliance** | `architecture-reviewer` | Clean-Arch dependency direction, data-protection + audit-trail for the project's domain (e.g. PHI encryption + audit middleware under HIPAA), row-level/data-access security (e.g. RLS on `${backend.platform}`) — parent may also load the principal-architect skill for a deep pass |
| **C — Test integrity** | `test-integrity-reviewer` | assertion_integrity, **TDD red/green evidence present**, AC + test-management coverage, completeness (no stubs/TODOs) |

Coordinator decision rule (100% consensus):
- **Ship only if every seat returns `approve` with zero `critical`/`major` findings.** Unanimous approve = pass.
- **Any** seat `request_changes`, **any** `critical`/`major` finding, or **any** `block` → gate fails. The coordinator consolidates all dissenting findings into one set (dedupe overlaps) and routes to Resolver.
- Seats do not negotiate with each other (no peer channel) — the coordinator is the only arbiter and tallies their independent votes.

```
CHECKPOINT-3.5: REVIEWER-PANEL
  REQUIRES:
    - All 3 seats spawned concurrently (single message) and each returned a Findings YAML
      (id, severity, rubric, file, line, issue, suggestion — "no findings" stated explicitly)
    - Each seat verdict: approve | request_changes | block
    - UNANIMOUS: every seat = approve AND zero critical/major findings across the whole panel
  BLOCKED BY:
    - Fewer than 3 seat verdicts present (a seat that errored must be re-spawned, not dropped)
    - Any seat request_changes, OR any critical/major finding from any seat (no majority override — 100% required)
    - Seat C reports missing TDD red/green evidence or an assertion weakened to pass
  ON FAIL:
    - Any dissent → coordinator consolidates findings → spawn Resolver → mandatory re-Tester → re-spawn FULL panel; max 2 panel rounds
    - Any seat block → stop; write incident to `${memory.store}`; do not push
  DO NOT run pushcommit until CHECKPOINT-3.5 passes with a unanimous approve and no critical/major findings
```

---

## Phase 3.6 — Resolver (conditional)

Fires when: Tester non-pass OR the review panel is not unanimous (any seat `request_changes`/`block`, or any `critical`/`major` finding from any seat).

Spawn `resolver` agent with the **consolidated** dissent from every seat (deduped). MAY edit app + test code. MAY NOT weaken assertions, add `@skip`, relax AC.

After Resolver: parent **mandatory** re-spawns Tester → then re-spawns the **full review panel** (all 3 seats concurrently). Max 2 panel rounds total, then escalate the residual dissent to the user.

```
CHECKPOINT-3.6: RESOLVER
  REQUIRES:
    - verdict: resolved | partial | rejected
    - diff_summary of changes made
  ON FAIL:
    - rejected → escalate to user immediately; do not push
    - partial → re-Tester; if still failing after round 2 → escalate
```

---

## Phases 3b → DONE — Finish line (shared)

Read `.claude/skills/shared/finish-line.md` and execute it exactly. It owns, in order: **Phase 3b** Format (CHECKPOINT-3b), **Phase 3c** Push incl. the project's pre-commit code-graph update if configured (e.g. `graphify update .`) (CHECKPOINT-3c), **Phase 4** Memory Writeback to `${memory.store}` — mandatory even on block (CHECKPOINT-4), **Phase PR**, **Phase PR-Review** (independent `pr-reviewer` cold review posting comments on the PR via the `${project.vcsHost}` connector, CHECKPOINT-PR-REVIEW), and **Phase DONE** closing gate (ask the user: related unit tests green? related E2E green?).

> If `${integrations.superpowers}`: drive the **Phase DONE** closing gate with `superpowers:verification-before-completion`, the **Phase PR-Review** cold review with `superpowers:requesting-code-review` / `superpowers:receiving-code-review`, and the merge/handoff with `superpowers:finishing-a-development-branch` — see `skills/shared/superpowers-integration.md`. Otherwise the finish-line checkpoints remain authoritative.

---

## Agent team

Parent owns: issue-tracker + memory/knowledge-store calls, Team Briefing, checkpoint verification, final "done" claims, Phase 4 writeback, pushcommit/create-pr. Agents never talk to each other — parent mediates via Team Briefing.

### Orchestration model (read this — it sets expectations)

- **Subagents are coordinator-routed, not peers.** There is no agent-to-agent channel. Every agent returns one result to the parent (coordinator); the parent feeds one agent's output into the next agent's prompt. "Communication" between agents always passes through the Team Briefing the parent maintains.
- **Concurrent where independent; sequential where data-dependent.** Read/analysis agents and the review panel are **spawned all at once in a single message**. `Coder → Tester → Reviewer-panel` stays ordered because it is a real data dependency (can't test absent code, can't review untested code), not an artificial limitation.
- **The coordinator decides and tallies votes.** Where a phase fans out (the review panel), the parent collects every vote and applies the gate. The review gate is **unanimous — 100% of seats must approve** (see Phase 3.5). The parent is the sole arbiter; a single dissent blocks.
- **For batch/multi-ticket scale**, the deterministic version of this team (parallel fan-out + per-item `pipeline()` handoff + vote tally) is the `Workflow` tool — use it when running many tickets at once; a single ticket runs the in-loop team described here.

Agents are defined in `.claude/agents/` and auto-discovered by Claude Code. Spawn by name.

| Role | Agent name | Mode | Owns |
|---|---|---|---|
| **Issue Harvester** | `jira-harvester` | read-only connector | Phase 0: issue tracker + linked docs + design-URL extraction; structured AC YAML (agent id retained; adapts to `${issueTracker.tool}`) |
| **Context Scout / DC Auditor** | `context-scout` | read-only | Phase 1.5 stage 1 + Phase DC: touched-surface map (diff, dep graph, layer violations, test-coverage map); per-AC verdict YAML |
| **Analyzer** | `analyzer` | read-only | Phase 1.5 stage 2: blast radius, compliance/Clean-Arch/data-access risk (e.g. HIPAA/PHI + RLS where the domain applies), scope-creep detection, design-component ID, Coder brief (consumes context-scout + the harvested AC) |
| **Coverage Auditor** | `coverage-auditor` | read-only | Phase 3 pre-check: Gherkin gap detection vs AC + touched surface; AC coverage; unit test gaps |
| **Coder** | `coder` | read/write | Phase 2: TDD RED→GREEN→REFACTOR — failing tests first (unit for every AC + Gherkin scenarios under `<STORY-KEY>/<tm>/`) captured failing, then minimal root-cause fix turning them green; component-reuse check; no assertion weakening |
| **Tester** | `tester` | test files + stack only | Phase 3: lint/typecheck/unit/api-bdd/ui-e2e/test-management-E2E; `verdict` YAML — every applicable stream (unit, E2E, test-management) MUST be green |
| **Review panel — Seat A** | `clean-code-reviewer` | read-only | Phase 3.5: Clean Code rubric (SOLID/DRY/KISS/YAGNI/naming/function_size/comments) |
| **Review panel — Seat B** | `architecture-reviewer` | read-only | Phase 3.5: Clean-Arch direction + data-protection/audit + data-access security risk (e.g. HIPAA/PHI + RLS where the domain applies; principal-architect skill loaded by parent for deep cases) |
| **Review panel — Seat C** | `test-integrity-reviewer` | read-only | Phase 3.5: assertion_integrity + TDD red/green evidence + AC/test-management coverage + completeness |
| **Resolver** | `resolver` | app + test files | Phase 3.6: one cohesive resolution pass when Tester fails or any review seat dissents |
| **PR Reviewer** | `pr-reviewer` | VCS-host connector + read | Phase PR-Review (post-create-pr): independent cold review of the PR diff; posts evidence-backed PR comments via the `${project.vcsHost}` connector |

The 3 review seats are spawned concurrently and vote independently; the coordinator requires a unanimous approve. All subagent free-form prose: `caveman` skill `ultra` intensity. YAML keys/paths/enums/line numbers stay verbatim.

---

## Reviewer rubric (tag each finding)

| Tag | Rule |
|-----|------|
| `srp/ocp/lsp/isp/dip` | SOLID: one reason to change; extend not modify; inward deps only |
| `dry` | Duplicated logic → shared util/schema/component |
| `kiss` | Accidental complexity, dead branches, unnecessary state |
| `yagni` | "Just in case" params/branches with no current caller |
| `naming` | `data`, `obj`, `handle`, `manager`, `helper` — name what it does |
| `function_size` | >1 responsibility; nesting >3; params >3 without object |
| `comments` | Why not what; stale/redundant; default = no comment |
| `clean_arch` | domain←application←infrastructure←presentation; no infra leak into domain |
| `data_protection` | Sensitive/regulated data encrypted at rest, never logged, audit middleware on its mutations — only where the project's domain regime applies (e.g. HIPAA/PHI). Tag verbatim as `hipaa` in finding YAML when that is the project's regime. |
| `assertion_integrity` | Diff that weakens or removes an existing assertion |
| `completeness` | Placeholder TODOs, stub implementations, missing edge-case handling |

Findings YAML: `id`, `severity: critical|major|minor`, `rubric`, `file`, `line`, `issue`, `suggestion`.

---

## Parallelization

| Parallel set | Constraint |
|---|---|
| Phase DC-0 fetches + DC Auditor | Single message, both read-only |
| Phase 0 fetches + Phase 1 MCPs + Context Scout | Single message, all read-only; CHECKPOINT-0 must pass before Coder |
| Analyzer | Runs after Context Scout (consumes its touched-surface map); before Coder |
| Tester suites: unit ‖ api-bdd ‖ ui-e2e | All with `run_in_background: true` inside Tester subagent |
| Tester ‖ coverage-auditor ‖ parent typecheck/lint | Single message, disjoint/read-only; parent reconciles coverage gaps + suite results before CHECKPOINT-3 |
| Review panel Seats A ‖ B ‖ C | Single message, all read-only; coordinator tallies; unanimous approve required (CHECKPOINT-3.5) |
| Phase 4: memory write ‖ requirements/knowledge write | Both target `${memory.store}` (a single store, or independent memory + requirements indexes if the project splits them) |

Sequential (never parallelize): Coder→Tester→Review-panel; Resolver→Tester→Review-panel; unanimous approve→pushcommit→create-pr.

---

## Team Briefing (parent-maintained, append-only)

```markdown
# Team Briefing — devfix <session-id>

## Intent
Issue key / User ask / Acceptance (issue Gherkin + Docs ACs)

## Docs ACs
- AC1: <text> — covered (<test:line>) | gap | not-yet-tested
...

## Test-management coverage
Story key: <PREFIX-###>   # drives ${testing.e2e.dir}/<features>/phase2/<STORY-KEY>/<tm>/
- <PREFIX>-T###: <test case name> — covered (<feature:line>, scenario green) | gap | not-yet-tested
- <PREFIX>-T###: ...
(or: "none found — ${testing.testManagement} returned no linked test cases", or "n/a — none")

## Design links
| url | fileKey | nodeId | contextHeading | relevant? |
|-----|---------|--------|----------------|-----------|
| <design-tool url ...?node-id=12-34> | abc123 | 12:34 | "<KEY> — Checkout layout" | yes |
| ... | ... | ... | "Old iteration v1" | candidate |
(or: "none found", or "n/a — ${design.figma} disabled")

## Phase 1 — Validation summary
structured-facts / semantic memory search ×2 / requirements search ×2 / recent-points list / broader semantic search hits; constraints (or "n/a — ${memory.store} is none")

## Code-graph context
code-graph query output / path traversal results for the bug area (or "no code-graph CLI")

## Design relevance
design_relevant: yes | no   # yes ⇒ run implement-designs design pipeline; no ⇒ skip even if links exist (one-line reason)

## Visual Inventory (when design_relevant: yes)
Per-container: bg color (hex), border (color+width+radius), padding (px), font (family/size/weight), icon (icon name or local asset path), child gap (px). Concrete values only — no "match the design".

## Touched surface (context-scout)
git diff / file dependency graph / architecture-layer violations / import direction / per-file test-coverage map

## Analyzer report (v<n>)
Scope / Blast radius / Risks (data_protection|clean_arch|data_access) / scope_drift_detected / Coder brief (files + lines + no-go list)

## Coder report (round <n>)
RED evidence (per AC/test-management case: command + captured failing output + why it is the bug's symptom) / GREEN evidence (same tests captured passing after fix) / Diff summary / typecheck output / Notes / Reviewer focus

## Coverage audit (coverage-auditor)
Per AC / Gherkin block / test-management case → covered (file:line) | diverged | missing; changed-file unit-test gaps

## Tester report (round <n>)
Verdict / Suites run (command + tail output + timing) / Failing / AC coverage / Gaps

## Green gate
green_gate block from skills/shared/green-gate.md — unit {harness, command, counts, verdict} /
e2e {harness, command, scope, counts, verdict} / scaffold_offer / overall: green | red | suggested-scaffold

## Review panel report (round <n>)
Seat A / Seat B / Seat C verdicts + Findings YAML each / coordinator tally (unanimous? ) / Ready to push

## Resolver report (round <n>)
Resolutions / Diff summary / Regression risk
```

Full subagent YAML output shapes → see `output-contracts.md`.

---

## Escalation rules

| Situation | Action |
|---|---|
| CHECKPOINT-0 blocked | Re-fetch; do not proceed |
| CHECKPOINT-1 blocked | Re-dispatch missing memory/knowledge-store calls; do not proceed |
| CHECKPOINT-1.5 blocked | Re-spawn the missing stage (context-scout for surface map, or analyzer for the Coder brief) with a specific prompt |
| CHECKPOINT-2-RED blocked (no failing test first, or test errors / passes on unchanged code) | Re-spawn Coder: write the bug-reproducing test and capture it failing for the right reason before any fix |
| CHECKPOINT-2-GREEN blocked | Re-spawn Coder; round 2 max then Resolver |
| RED test made green by weakening/removing an assertion or adding @skip | Hard block — do not accept; re-spawn Coder/Resolver to fix root cause, never the test |
| Tester pass but no runner output | Re-spawn Tester: "Run the commands. File checks do not count." |
| Tester pass but AC gap | Treat as fail → Resolver to add coverage → re-Tester |
| Tester pass but test-management coverage gap (missing test-management scenario or red scenario) | Treat as fail → Resolver to add/fix scenario under `<STORY-KEY>/<tm>/` → re-Tester |
| Tester fail, likely_owner=coder | Re-spawn Coder round 2; if still fails → Resolver |
| Tester fail, likely_owner=tester | Re-spawn Tester (test files only); max 2 rounds |
| Tester fail, likely_owner=infra | Shell debug or explicit Phase 3a skip with block |
| Tester green on the tag subset but the full suite was never run | Not green — re-spawn Tester for the full unit + full E2E run (`skills/shared/green-gate.md`) |
| `${testing.unit.runner}` or `${testing.e2e.runner}` is `none` | Green gate absent-harness branch: offer `scaffold-test-projects` (Gherkin + page objects + typed web elements + hooks), record `suggested-scaffold`; never skip silently |
| Tester skip without phase_3a_block | Re-spawn Tester |
| Tester block | Stop. Write incident to `${memory.store}` |
| Review panel not unanimous (any seat request_changes or any critical/major) | Coordinator consolidates findings → Resolver → re-Tester → re-spawn FULL panel; max 2 panel rounds |
| Review panel seat returned a critical/major but verdict=approve | Treat the whole panel as not-unanimous → Resolver (no seat may self-override) |
| Any review seat block | Stop. Write incident. Do not push |
| Review panel deadlock (still not unanimous after 2 rounds) | Escalate to user with the residual dissent; do not push |
| A review seat errored / returned no verdict | Re-spawn that seat; never tally a missing vote as approve |
| Resolver rejected | Escalate to user immediately |
| Phase 3b format:check fails | Run the project's formatter in write mode (e.g. `pnpm exec prettier --write`) on flagged files, re-stage, re-run; never push with format:check red |
| Phase 4 skipped | Retry immediately; log violation |
| Analyzer data_protection:high or clean_arch:high | Seat B (`architecture-reviewer`) already on the standing panel; parent loads the principal-architect skill into that seat and raises its findings to critical |

---

## Toolchain gotchas (shared)

Static toolchain/platform facts live in `.claude/skills/shared/toolchain-gotchas.md` — check it before assuming infra failure. Incident-derived lessons are **not** kept there or here: they live in `${memory.store}` only and surface via the Phase 1 memory queries.

---

## Related skills

- Test-management ↔ E2E mirrors (`${testing.testManagement}`, the `${testing.e2e.tagConvention}` tag, e.g. `@TestCaseKey=`): `test-management-sync`
- Gherkin sub-flow: `gherkin-memory-at-start` → `gherkin-clarify-and-scope` → `gherkin-implement-and-store` → `gherkin-run-and-assure`
- Memory / knowledge store: `memory-first`, `memory-validator`, `the-journalist`
- By area: `backend-feature-workflow`, `database-migration`, `serverless-function`, `frontend-component-conventions`, `react-frontend-developer`, `figma-plan-and-validate` → `implement-designs`
- Verification: `run-tests`, `double-check-code`, `e2e-narrow-fail-focus-success`, `test-endpoint`
- Green gate (full unit + full E2E, or the scaffold offer): `skills/shared/green-gate.md`, `scaffold-test-projects`
- Architecture escalation: `principal-architect`
- Post-delivery: `github-pr-review`
