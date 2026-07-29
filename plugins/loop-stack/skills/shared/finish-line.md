# Finish line — Phases 3b → DONE (shared by devfix + implement)

> Reads project specifics from `.claude/stack.md` — `${commands.*}` (format/typecheck/lint), `${testing.*}`,
> `${memory.store}`, `${project.repo}`, `${issueTracker.*}`, and the commit convention. Concrete tools below
> (Prettier, a commitlint scope enum, a knowledge graph CLI, a vector memory store, GitHub) are **examples** —
> substitute the configured ones; if a capability is `none`, the step is a no-op.

Run after CHECKPOINT-3.5 (Review panel unanimous approve). Single source of truth — never copy these phases back into a skill.

---

## Phase 3b — Format (mandatory before Push)

Run the project's formatter (`${commands.format}`, e.g. Prettier) on every changed file before committing. A typical CI format check runs against the **committed** state, while the local check runs against the **working tree** — this gap causes repeated false-green-locally / red-on-CI cycles. Phase 3b closes that gap. Skip entirely if the project has no formatter.

Steps:
1. Compute changed files: `git diff --name-only --cached HEAD; git diff --name-only HEAD; git ls-files --others --exclude-standard` (or after staging, just `git diff --name-only --cached`).
2. Filter to the file types the formatter owns (minus any ignore-file entries).
3. Run the formatter's write mode on the filtered list (e.g. `<pkg-manager> exec prettier --write <files…>`).
4. Re-run the format check against the **whole repo** to confirm no other drift slipped in.
5. Re-stage any files the formatter rewrote.

```
CHECKPOINT-3b: FORMAT
  REQUIRES:
    - formatter write mode executed against every changed file it owns
    - ${commands.format} exits clean (the formatter reports no style issues)
    - Any rewrites re-staged
  BLOCKED BY:
    - formatter reports any "style issues found" line
    - format check skipped or exit non-zero
  ON FAIL: Re-run the formatter's write mode; never push with the format check failing — CI lint will block the PR
```

---

## Phase 3c — Push

Pre-commit: if the project uses a code-knowledge/graph indexer, refresh it so the index reflects the change (e.g. a `graphify update .` per the project's rules). Include any generated index output in the commit only if the repo tracks it. Skip if no such tool is configured.

Parent runs `/pushcommit` only after CHECKPOINT-3.5 **and** CHECKPOINT-3b pass.

Commit format: follow the project's commit convention — derive the key from `${issueTracker.keyPrefix}`/`${vcs.branchNaming}` and use the type/scope the repo enforces (e.g. a Conventional Commit `type(scope): subject` with a commitlint scope enum); no assistant attribution, lowercase subject, imperative mood. If the project defines an allowed-scope enum, use only those scopes and split into multiple commits when changes span buckets; invented scopes are rejected.

```
CHECKPOINT-3c: PUSH
  REQUIRES:
    - CHECKPOINT-3 passed (all suites green, no AC gaps)
    - CHECKPOINT-3.5 passed (Review panel unanimous approve, no critical/major findings)
    - CHECKPOINT-3b passed (formatter clean across changed files)
    - code-knowledge indexer refreshed (or noted as not configured / CLI unavailable)
    - Commit message matches the project's commit convention (allowed scope enum if any)
  BLOCKED BY:
    - Any prior checkpoint not passed
    - Any review seat block or unresolved critical/major findings
    - format check failing (CI will block the PR with the same error)
  DO NOT run /create-pr until CHECKPOINT-3c passes
```

---

## Phase 4 — Memory Writeback (mandatory always when `${memory.store}` ≠ none)

Write the work summary to `${memory.store}` using the verbs it exposes (e.g. a `memory_store` + a requirement-vector `store` in parallel) — **mandatory on every run, success or block, no exceptions** when a store is configured. Then confirm the write (e.g. a `find`/`qdrant-find` read-back). If `${memory.store}` is `none`, skip this phase.

Store: summary of the work (fix or implementation), root cause / design decisions, AC coverage outcome, new components/procedures created, patterns used. For bug fixes this is the lesson: root cause, wrong→right behavior, the guard that prevents recurrence (`type: incident|pattern`, `project: ${project.repo}`, `importance ≥ 0.6`; update in place instead of duplicating).

```
CHECKPOINT-4: WRITEBACK
  REQUIRES:
    - work summary stored to ${memory.store} (skip if none)
    - requirement-vector store written if the project keeps one
    - a read-back confirms data written
  BLOCKED BY:
    - Any store call missing (when ${memory.store} ≠ none)
  ON FAIL: Retry stores; log "Phase 4 skipped" violation in the memory store at next session start
  NOTE: Phase 4 runs even on block/failure — write the incident, not the deliverable
```

---

## Phase PR — Pull Request

Parent runs `/create-pr` after CHECKPOINT-3c passes.

Title: `{ISSUE_KEY} type(scope): description`. Body: CHANGELOG-style `## What changed` + `## ACs covered`. No auto-merge.

---

## Phase PR-Review — Independent cold review (mandatory post-action)

After `/create-pr` returns a PR number, spawn the `pr-reviewer` agent. This is **not** the in-loop review panel — it is an independent, **cold-start** reviewer that fetches the PR diff straight from the VCS host with no session context. The absence of context is the point: it catches what the implementing session normalised away. It posts findings as PR comments (evidence-mode: every finding carries a verbatim `file:line` diff excerpt).

Input: `{ owner: "<from ${project.repo}>", repo: "<from ${project.repo}>", pull_number: <n>, issue_key: "${issueTracker.keyPrefix}-<n>" }`.

```
CHECKPOINT-PR-REVIEW: INDEPENDENT-REVIEW
  REQUIRES:
    - pr-reviewer spawned with the created pull_number
    - pr-reviewer posted its review to the PR (verdict: APPROVE | REQUEST_CHANGES) with quoted diff evidence per finding
  BLOCKED BY:
    - PR created but pr-reviewer not run
    - pr-reviewer findings posted but a blocking/major finding left unaddressed
  ON FAIL:
    - REQUEST_CHANGES with blocking/major → re-enter at Resolver (Phase 3.6) → re-Tester → re-panel → push fixups → re-run pr-reviewer
    - VCS-host MCP 403 on diff/check-runs → fall back to the host CLI (e.g. `gh`) for the diff; review-write still via MCP
  NOTE: minor/non-blocking pr-reviewer comments may ship; surface them to the user, don't silently close
```

---

## Phase DONE — Closing Gate (mandatory, always last)

After every run — success, block, or partial — the parent runs the **green gate** and then reports it.

1. **Run it, don't ask about it.** Execute `.claude/skills/shared/green-gate.md` exactly: full unit
   suite + full E2E suite, after the final edit, with exact commands and raw tail output. A remembered
   Phase-3 result is not a substitute — code moved since (Resolver, format, fixups).
2. **Report the evidence**, then ask the user to confirm:

   > **All unit tests green? All E2E green?** — here is the run: `<green_gate block>`

3. **If either suite doesn't exist**, don't silently pass the gate — make the offer from the green
   gate (Gherkin + page objects + typed web-element wrappers + hooks via `scaffold-test-projects`),
   record `suggested-scaffold`, and surface it in the same message.

Wait for explicit user confirmation before considering the session complete. If the user says no or reports a failure, re-enter at the appropriate phase (Tester or Resolver).

```
CHECKPOINT-DONE: GREEN-GATE
  REQUIRES:
    - CHECKPOINT-GREEN passed (see skills/shared/green-gate.md) — full unit + full E2E green post-final-edit
    - green_gate block shown to the user with the verbatim commands and counts
    - Absent harness (if any) surfaced with the scaffold offer, not skipped
  BLOCKED BY:
    - Asking "tests green?" without having run them
    - Reporting a Phase-3 run as the closing gate after further edits
    - Either suite red, or a full run silently narrowed to a tag-filtered one
  ON FAIL: re-enter at Tester (suite red) or Resolver (implementation red); never close the session on an unrun gate
```
