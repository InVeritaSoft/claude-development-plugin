# Superpowers integration (optional)

> Reads `${integrations.superpowers}` from `.claude/stack.md` (written by the `onboard` skill, which
> detects whether the **superpowers** plugin is installed). This file is the single source of truth
> for the delegation contract — other skills, loops, and commands **reference it, never restate it**.

## The contract

The loop-stack disciplines below already exist as built-in checkpoints. The [superpowers][sp] plugin
ships richer, upstream-maintained versions of the same disciplines. When both are present, prefer
superpowers for the shared discipline and keep the built-in checkpoint as the fallback.

- **When `${integrations.superpowers}` is `yes`:** at the touchpoint, invoke the mapped superpowers
  skill (e.g. `superpowers:test-driven-development`) and let it drive that discipline. The built-in
  checkpoint still gates the phase — superpowers replaces *how* you satisfy it, not *whether* it is
  verified.
- **When `${integrations.superpowers}` is `no` / the section is missing:** use the built-in
  checkpoint described inline in the skill. This is the default.
- **Absence is never an error.** No skill may hard-fail, block, or stall because superpowers is not
  installed. If an `invoke` of a superpowers skill is unavailable at runtime, silently fall back to
  the built-in checkpoint and continue.

Superpowers is an **enhancement layer**, exactly like every other capability in `.claude/stack.md`:
present → use it; `none` → skip and use the built-in path.

## Mapping — loop-stack touchpoint → superpowers skill

> `devfix` is the **bug** path (rigid RED→GREEN); `implement` (+ `backend-feature-workflow`) is the
> **non-bug / feature** path (test-backed, not rigid-TDD). Both share these disciplines.

| loop-stack phase / file | Prefer (when installed) |
|---|---|
| `devfix` RED→GREEN discipline (the Iron Law) · `implement` unit-test strategy | `superpowers:test-driven-development` |
| `devfix` / `implement` debugging a failing symptom | `superpowers:systematic-debugging` |
| `devfix` final gate · `implement` verification checklist · `double-check-code` | `superpowers:verification-before-completion` |
| `devfix` review phase · `github-pr-review` | `superpowers:requesting-code-review`, `superpowers:receiving-code-review` |
| loops fanning out agent teams · `launch-loop-stack` | `superpowers:dispatching-parallel-agents`, `superpowers:subagent-driven-development` |
| PR merge + handoff steps | `superpowers:finishing-a-development-branch` |

## Usage note for skill authors

At a touchpoint, add **one line**, not a copy of this contract:

> If `${integrations.superpowers}`, invoke `superpowers:<skill>` for this phase — see
> `skills/shared/superpowers-integration.md`. Otherwise use the checkpoint below.

The built-in checkpoint must remain complete and authoritative on its own, so the skill works with
zero external plugins.

[sp]: the official `claude-plugins-official` superpowers plugin.
