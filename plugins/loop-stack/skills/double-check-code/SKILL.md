---
name: double-check-code
description: Systematically verify code quality after implementation by running builds, tests, lints, and reviewing for common mistakes. Use after implementing features, fixing bugs, or making any code changes to ensure quality and catch regressions.
---

# Double-Check Code

## Purpose

Systematically verify code quality after implementation by running builds, tests, lints, and reviewing for common mistakes.

> **Read `.claude/stack.md` first; use its values; never assume a specific tool.** If a needed capability is `none`, skip those steps. If the config is missing, run the `onboard` skill and stop.

All build/lint/test commands come from `${commands.*}` (e.g. pnpm/npm/yarn `build`, `typecheck`, `lint`, `test`). Run them from the appropriate package/dir for the changed code. Skip any step whose command is `none`.

## When to Use

Use this skill after:
- Implementing new features
- Fixing bugs
- Making any code changes
- Refactoring code
- Before committing changes

## Verification Checklist

### 1. Build Verification
- Run `${commands.build}` or `${commands.typecheck}` from the appropriate directory
- Ensure the project's type/compile step passes
- Check for broken imports or circular dependencies
- Verify no build errors or warnings

### 2. Lint Verification
- Run `${commands.lint}` to check code style and quality
- Fix all linting errors
- Remove unused lint-suppression directives (e.g. `eslint-disable`)
- Ensure code follows project conventions

### 3. Test Verification — the green gate (mandatory)

Execute `.claude/skills/shared/green-gate.md`; it owns the definition of green. In short:
- Run the **full** unit suite and the **full** E2E suite — not just the changed package, not just the
  issue's tag subset — after the final edit
- Both green, with the verbatim command and raw tail output (counts + timing) recorded
- No assertion weakened, skipped, or removed to get there
- If a suite doesn't exist, offer `scaffold-test-projects` (Gherkin + page objects + typed
  web-element wrappers + hooks) and record `suggested-scaffold` — never a silent skip
- E2E red → route to `e2e-narrow-fail-focus-success`; the gate stays red until it's green

### 4. Code Review
- Review for common mistakes:
  - Type safety violations
  - Unused variables or imports
  - Missing error handling
  - Security vulnerabilities
  - Performance issues
  - Logic errors

### 5. Integration Check
- Verify changes work with existing code
- Check for breaking changes
- Ensure API contracts are maintained
- Verify environment variable usage

## Workflow

1. **Build**: Run build/typecheck commands
2. **Lint**: Fix all linting issues
3. **Test**: Run the green gate — full unit suite + full E2E suite green (or the scaffold offer)
4. **Review**: Manually review code for issues
5. **Verify**: Ensure integration works correctly

## Common Issues to Check

- Type safety: No `any` types or unsafe assertions
- Error handling: Proper error messages (generic for auth errors)
- Security: No secrets in code, proper RBAC checks
- Architecture: Proper dependency direction, no circular deps
- Performance: No unnecessary re-renders or expensive operations

## Related skills

- `shared/green-gate.md` — the authoritative post-implementation gate this skill's step 3 executes.
- `scaffold-test-projects` — build the suite when the gate finds none (page objects + typed web elements + hooks).
- `run-tests` — targeted suite runner this skill delegates to.
- `generate-tests-after-implementation` — add missing coverage before the final pass.
- `e2e-narrow-fail-focus-success` — when E2E is red, route there instead of looping here.
- `principal-architect` — escalate here for architecture/security/clean-arch concerns discovered in code review.
- `mobile-friendly-checker` — responsiveness and touch-target audit on frontend changes.
- `memory-validator` — verify implementation aligns with stored business logic before marking done.
- `devfix` — Phase 3 verification step in the devfix loop; Reviewer subagent plays a similar role inside devfix.
