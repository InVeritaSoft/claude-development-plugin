# Definition of Done

> Reads project specifics from `.claude/stack.md` — issue tracker (`${issueTracker.*}`), commands
> (`${commands.*}`), testing (`${testing.*}`), backend/edge platforms (`${backend.*}`/`${edge.*}`), frontend
> (`${frontend.*}`), states (`${issueTracker.states}`), and the compliance regime from the project's rules
> file. Concrete tools below are **examples** — substitute the configured ones; if a capability is `none`,
> that item is a no-op.

Every implementation task (devfix, implement-e2e, feature branch) must satisfy all applicable items below before being declared done. No partial credit.

## Acceptance criteria (AC gate)

- [ ] AC harvested **fresh** at finish time from the issue tracker (description + comments) — not recalled from an earlier phase
- [ ] **Every linked spec/wiki page fetched and parsed for AC** (walk up to subtask parent / Epic if the issue carries none; e.g. on Jira `getJiraIssueRemoteIssueLinks` → `getConfluencePage`) — linked pages present but unfetched = BLOCKED. Skip if the tracker has no linked-pages capability.
- [ ] Every AC item (tracker + linked pages) mapped to an implementation pointer and a covering test — gaps resolved or explicitly deferred with user sign-off and a ticket reference
- [ ] PR body contains the `## ACs covered` table (criterion → implementation → test → status); if no AC exists anywhere, the body says so explicitly

## Code quality

- [ ] `${commands.typecheck}` passes with zero errors (run from repo root)
- [ ] `${commands.lint}` passes with zero errors (run from repo root)
- [ ] No unsafe casts or non-null assertions introduced where the project's linter bans them
- [ ] No hardcoded string literals for domain concepts — enums used throughout

## Compliance / Security (per the project's regime)

> Apply against the project's declared regime and sensitive-data classes (e.g. HIPAA PHI, GDPR PII). No-op if the project handles no regulated data.
- [ ] No regulated/sensitive data logged or returned in error messages
- [ ] Every new or modified procedure that mutates sensitive data goes through the project's audit mechanism (e.g. an audit middleware)
- [ ] No new sensitive fields exposed to the frontend beyond what the AC requires
- [ ] Error messages are generic and non-enumerating (no "user not found" vs "wrong password")

## Tests — the green gate (`skills/shared/green-gate.md` is authoritative)

- [ ] **Full unit suite green** — every package, not just the changed one; exact command + raw output recorded
- [ ] **Full E2E suite green** — whole suite, not just the issue's `${testing.e2e.tagConvention}` subset; exact command + raw output recorded
- [ ] Both suites run **after the final edit** — no green claimed from a stale run
- [ ] If a suite doesn't exist: the `scaffold-test-projects` offer was made (Gherkin + page objects + typed web-element wrappers + hooks) and the outcome recorded as `suggested-scaffold` — an absent harness is never a silent skip
- [ ] All tracker-tied and spec-sourced scenarios exist in the repo and pass
- [ ] Unit tests added or updated for every changed module (mirror source structure per `${testing.unit.locations}`)
- [ ] No test assertions weakened or commented out to make a suite pass
- [ ] E2E scenarios run against the local stack (`${backend.platform}` + `${edge.platform}` + targeted app) — not skipped without a documented reason
- [ ] `green_gate` report block present with `overall: green` (or an explicit, user-surfaced `suggested-scaffold`)

## Architecture

- [ ] Dependency direction intact: `domain` ← `application` ← `infrastructure` ← `presentation` — no inward violations
- [ ] Services accessed via the app/request context (e.g. `ctx.services.*`) — no direct service/adapter imports in routers or use cases
- [ ] No infrastructure adapters initialized at module load (lazy init only)
- [ ] LEGO rule (see `lego-philosophy` skill): no new one-off UI primitives when a shared component already exists in `${frontend.apps}` / the shared UI package

## Delivery

- [ ] PR created and linked to the tracker ticket (transition ticket to `${issueTracker.states.inReview}`)
- [ ] PR description includes: what changed, why, how to test manually, and which scenarios were run
- [ ] No merge into a frozen branch — check iteration/release status before proposing a PR target
- [ ] If blocked by another ticket (`blocks` / `is blocked by` link), that dependency is resolved or explicitly accepted before merging

## QA handoff (attach to PR description or a tracker comment)

- [ ] List of E2E scenario names that cover the AC
- [ ] Steps to manually verify the happy path and the key edge cases
- [ ] Any known limitations or out-of-scope items with ticket references
