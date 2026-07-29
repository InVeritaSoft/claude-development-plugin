# Green Gate — all unit tests green + all E2E green after every implementation

> Reads project specifics from `.claude/stack.md` — the unit runner/locations (`${testing.unit.*}`),
> the E2E runner/dir/BDD step/tag convention (`${testing.e2e.*}`), `${commands.*}` (package manager,
> test/typecheck/lint scripts), and `${frontend.apps}` / `${backend.*}` / `${edge.*}` for local stack
> bring-up. Every concrete tool named below (Vitest, Playwright, playwright-bdd) is a **parenthetical
> example** — substitute the configured one.

Single source of truth for the post-implementation test gate. Every flow that changes code —
`devfix`, `/implement`, `backend-feature-workflow`, `implement-designs`, `database-migration`,
`serverless-function`, the gherkin sub-flow, any loop tick — ends here. Other files **reference**
this gate; they must not restate it.

## The rule

```
NO IMPLEMENTATION IS DONE UNTIL THE WHOLE UNIT SUITE AND THE WHOLE E2E SUITE ARE GREEN.
WHEN A SUITE DOES NOT EXIST, OFFER TO BUILD IT — NEVER SILENTLY SKIP.
```

- **After every implementation.** Bug fix, feature, refactor, design port, migration, config change
  — if source changed, the gate runs. "Small change" is not an exemption.
- **All means all.** Not the touched package, not the issue's `${testing.e2e.tagConvention}` tag
  subset — the *complete* unit suite and the *complete* E2E suite. Targeted runs are for iterating;
  the gate is the full run.
- **Evidence or it didn't happen.** Every stream reports the exact command and the raw tail output
  (pass/fail/skip counts + timing). File-existence checks, `grep`, "tests should pass", and a
  remembered earlier run are not execution.
- **Red is red.** One failing test — anywhere in the suite, related to this change or not — fails
  the gate. Report it as red; never round up to "green except…".
- **Absent ≠ skipped.** A missing harness is the **one documented exception** to the config
  contract's "skip, don't ask" rule (`CONVENTIONS.md`): report `suggested-scaffold` and offer the
  build (below). Do not invent a runner, and do not proceed as though the suite were green.

## Step 1 — Classify the harness (before running anything)

| Signal | Classification | Action |
|---|---|---|
| `${testing.unit.runner}` / `${testing.e2e.runner}` is set **and** the suite has tests | **present** | Step 2 — run it |
| Runner is `none`, or its dir/locations are empty / hold no tests | **absent** | Step 3 — offer the scaffold |
| E2E present but steps bind raw selectors inline (no `pages/`, no `elements/` layer) | **present, unstructured** | Run it, and offer the page-object / web-element layer (Step 3b) |
| Harness present but the changed surface has no covering test | **coverage gap, not absent** | `generate-tests-after-implementation` — write the tests, then run. Never a scaffold suggestion |

Classify unit and E2E **independently** — one may be present while the other is absent.

## Step 2 — Run (present)

Iterate targeted, gate on full. Order matters: cheap signal first.

1. **Typecheck + lint** — `${commands.typecheck}`, `${commands.lint}` (skip either if `none`).
2. **Targeted, while iterating** — the changed package's unit tests; the E2E scenarios matching the
   issue's `${testing.e2e.tagConvention}` tag. Fast loop, not the gate.
3. **Full unit suite** — every package, from repo root (`${commands.test}` / the configured unit
   script). No `--filter`, no path argument, no `.only`.
4. **Full E2E suite** — bring up the local stack per `${backend.*}` / `${edge.*}` / `${frontend.apps}`,
   run the BDD generation step from `${testing.e2e.dir}` (never from repo root — the runner config
   lives there), then the whole suite with no `--grep`:
   ```bash
   cd ${testing.e2e.dir} && ${testing.e2e.bddStep} && <e2e run command> --reporter=list
   ```
5. **Re-run once on a suspected flake**, then take the second result as final. Two runs, no more —
   a test that alternates is red, and the flake is a finding.

**Infra failure ≠ test failure.** Check `${recoveryNotes}` and `shared/toolchain-gotchas.md` before
calling a suite blocked (duplicate-dependency crashes needing a package-manager dedupe, a stack that
must be restarted, a BDD step run from the wrong cwd). Attempt the documented recovery first.

**Full-E2E escape hatch (explicit only).** If the full E2E suite genuinely cannot run — no local
stack available, suite exceeds the session budget — the gate is **not** green. Record a block with
the verbatim failing command, what *was* run instead (tag-filtered scenarios), and surface it to the
user. A silent narrowing from full suite to tag subset is a gate violation.

## Step 3 — Offer the scaffold (absent)

Do not ask whether tests matter, and do not stop the delivery on the offer. State the gap, name the
building blocks, and route to **`scaffold-test-projects`**:

> **No <unit|E2E|unit or E2E> test project found.** I can bootstrap one before this ships:
> Gherkin `.feature` files as the source of truth, **page objects** (one per screen/route, exposing
> intent methods like `login(email, password)` — never selectors), typed **web-element wrappers**
> (every `Locator` touched in one place, with auto-waiting `click` / `fill` / `expectVisible`), and
> **hooks/fixtures** owning setup, teardown, auth state, and data seeding — so a markup change
> touches one line, not every step file. Want me to run `scaffold-test-projects`?

Then:
- **User accepts** → run `scaffold-test-projects`, land its two smoke checkpoints (E2E-SCAFFOLD +
  UNIT-SCAFFOLD), re-run this gate from Step 1, and tell the user to re-run `onboard` so
  `.claude/stack.md` records the new runners/dirs/tag convention.
- **User declines or is not present** (an autonomous loop tick) → gate outcome is
  `suggested-scaffold`, carried verbatim into the report / PR body / loop log. The work may ship;
  the missing harness may not disappear from the record.

### Step 3b — Present but unstructured

The suite exists and runs, but steps hold raw selectors. Don't rewrite it wholesale mid-fix. Add the
`WebElement` wrapper + a page object for the screen this change touched, migrate that screen's steps
onto them, and note the remaining screens as follow-up. New scenarios written from here on bind to
page objects only.

## Prohibitions (hard blocks, never workarounds)

| Forbidden | Instead |
|---|---|
| Weakening/removing an assertion, `@skip`, `.skip`, `.only`, commenting a test out to get green | Fix the root cause; escalate if it isn't fixable |
| Narrowing the gate run to the changed package / tag subset and calling it green | Run the full suites; if a full run is impossible, record the explicit block |
| Reporting "tests pass" from a run that predates the last edit | Re-run after the final edit |
| Marking a red suite as "pre-existing failure" and moving on | Confirm it is pre-existing against the base branch, state that verbatim, and keep the gate red |
| Inventing a runner, config, or script the project doesn't have | Classify as absent → Step 3 |

## CHECKPOINT-GREEN

```
CHECKPOINT-GREEN: ALL-SUITES
  REQUIRES:
    - Harness classified for unit AND e2e (present | absent | present-unstructured)
    - PRESENT: full suite executed post-final-edit — exact command + raw tail output (counts + timing) in the report
    - PRESENT: unit verdict green AND e2e verdict green — zero failures, zero unexplained skips
    - ABSENT: scaffold offer made verbatim (page objects + typed web elements + hooks + Gherkin),
      outcome recorded as suggested-scaffold, and the user's answer captured
    - green_gate block present in the report / Team Briefing
  BLOCKED BY:
    - Any failing test in either suite
    - Suite claimed green with no command + raw output
    - Full run silently replaced by a targeted/tag-filtered run
    - Absent harness skipped without the scaffold offer
    - Any assertion weakened, skipped, or removed to reach green
  ON FAIL:
    - Failing test owned by the implementation → fix the code, re-run
    - Failing test owned by the test → fix the test (never the assertion's intent), re-run
    - Failing for infra reasons → apply ${recoveryNotes} / toolchain-gotchas, retry; only then record an explicit block
    - Absent harness → make the offer, then proceed per the user's answer
```

## Report block (paste into the Team Briefing / final message / PR body)

```yaml
green_gate:
  unit:
    harness: present | absent | present-unstructured
    command: "<verbatim command run>"
    result: {pass: 0, fail: 0, skip: 0, duration: "0s"}
    verdict: green | red | suggested-scaffold
  e2e:
    harness: present | absent | present-unstructured
    command: "<verbatim command run>"
    scope: full-suite | tag-filtered (blocked — reason)
    result: {pass: 0, fail: 0, skip: 0, duration: "0s"}
    verdict: green | red | suggested-scaffold
  scaffold_offer: null | "offered — accepted | declined | no user (loop tick)"
  overall: green | red | suggested-scaffold
```

## Where the gate fires

| Flow | Where |
|---|---|
| `devfix` | Phase 3 final-gate rule (CHECKPOINT-3) and again at Phase DONE |
| `/implement`, `/implementfix` | Step 5 verification checklist |
| `backend-feature-workflow` | Phase 8 pre-commit verification |
| gherkin sub-flow | `gherkin-run-and-assure`, before assuring the user |
| Any flow reaching the finish line | `shared/finish-line.md` Phase DONE |
| Loop ticks (FIX / VERIFY / DEPLOY-FIX / PR-SHEPHERD) | Before transitioning a ticket or pushing |

## Related

- `scaffold-test-projects` — builds the absent harness (page objects, typed web elements, hooks, Gherkin).
- `run-tests` — picks and runs the right suite; this gate is its full-suite closing form.
- `generate-tests-after-implementation` — covers a gap inside an existing harness.
- `e2e-narrow-fail-focus-success` — triage path when the E2E suite comes back red.
- `double-check-code` — the wider quality gate (build + lint + test + review) that includes this one.
- `shared/definition-of-done.md`, `shared/finish-line.md` — where the gate is enforced at delivery.
- `shared/superpowers-integration.md` — when `${integrations.superpowers}`, the evidence discipline
  runs through `superpowers:verification-before-completion`; this gate's requirements still hold.
