# Implement fix

Read `.claude/stack.md` first; use its values; never assume a specific tool; if a needed capability is `none`, skip those steps; if the config is missing, run the `onboard` skill and stop.

Apply the fix in code. Do not only suggest, describe, or plan—change the code and deliver a complete, mergeable result.

**Universal:** Use in any repo (frontend, backend, tests, scripts). Follow the project’s stack and conventions from `.claude/stack.md`.

---

## Scope

- Prefer changes in the **relevant layer** (e.g. app code, tests, config) unless the issue clearly requires another (e.g. API, DB, infra).
- If part of the fix is out of scope (e.g. external service, permissions), say so explicitly and implement whatever is possible in this codebase.
- **Treat failed steps and scenarios like bugs in code** — fix the underlying cause (app, test, or env), not by skipping or weakening assertions.

---

## Actions

1. **Edit the relevant files**  
   Wherever the behavior is implemented: components, services, stores, effects, tests, steps, helpers, config.

2. **Add or adjust logic**  
   As needed: handlers, parsing, navigation, polling, deferred updates, etc.

3. **Follow existing patterns and workspace rules**  
   Respect the project’s conventions, style, and any repo rule files or docs (e.g. `AGENTS.md`, `CLAUDE.md`, editor/agent rule directories). If `${commands.commitNoAttribution}` is set, avoid AI-revealing comments.

4. **Verify — the green gate**
   Run `${commands.lint}` and `${commands.typecheck}` on the change, then execute
   `.claude/skills/shared/green-gate.md`: the **full** unit suite and the **full** E2E suite green
   after the final edit, each reported with its verbatim command and raw output. Targeted runs are
   the iteration loop, not the gate. Fix anything red — never by weakening or skipping a test.
   If a suite doesn't exist, say so and offer `scaffold-test-projects` (Gherkin + page objects +
   typed web-element wrappers + hooks); an absent harness is reported, not silently skipped.

---

## Outcome

- **Complete change:** No placeholders, no “here’s what you could do” without applying edits.
- **Mergeable:** Changes are minimal and localized; no unrelated refactors.
- **Optional:** After implementing, suggest a one-line git commit message that describes the fix.

---

## One-line prompt (for quick use)

Implement the fix: apply the change in code, not just in text. Prefer edits in the relevant layer (app, tests, config) unless the issue requires another. Edit the right files, add or adjust logic as needed, follow the project’s patterns and workspace rules, and fix any new lint/test failures. Close with the green gate: all unit tests green and all E2E green (full suites, with the commands and output shown) — or, if a suite doesn’t exist, offer to scaffold one with page objects and typed web elements. Deliver a complete, mergeable change; if part of the fix is out of scope, say so and do what’s possible in this codebase. Optionally suggest a one-line git commit message for the fix.
