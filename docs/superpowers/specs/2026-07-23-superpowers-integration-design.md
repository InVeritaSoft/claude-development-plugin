# Optional Superpowers Integration for loop-stack — Design

**Goal:** Let the loop-stack plugin *optionally* delegate its shared engineering disciplines
(TDD, systematic debugging, verification, code review, agent fan-out, branch finishing) to the
official **superpowers** plugin when it is installed — while degrading gracefully to the built-in
checkpoints that already exist when it is not. No vendoring, no hard dependency.

## Principle

Mirror loop-stack's existing `none → skip` DNA. Superpowers is treated as one more **optional
capability gated by config** (`${integrations.superpowers}`), never a required dependency. Every
touchpoint keeps its existing built-in checkpoint as the authoritative fallback; the superpowers
skill is preferred only when present because it is the richer, upstream-maintained version.

## Components

### 1. Contract — single source of truth

New file `plugins/loop-stack/skills/shared/superpowers-integration.md`, referenced (never restated)
by every touched skill/loop — same pattern as `skills/shared/definition-of-done.md`. It holds:

- **The rule:** When `${integrations.superpowers}` is true, prefer the named superpowers skill for
  the shared discipline; otherwise use the built-in checkpoint described inline. Absence is never an
  error — skills must not hard-fail or block on a missing superpowers plugin.
- **The mapping table** (below).
- A note that the config value is written by `onboard` and read from `.claude/stack.md` like every
  other `${...}` token.

| loop-stack phase / file | superpowers skill (when present) |
|---|---|
| devfix RED→GREEN discipline | `test-driven-development` |
| devfix debugging the failing symptom | `systematic-debugging` |
| devfix final gate / `double-check-code` | `verification-before-completion` |
| devfix review phase / `github-pr-review` | `requesting-code-review` (+ `receiving-code-review`) |
| loops fanning out agent teams / `launch-loop-stack` | `dispatching-parallel-agents`, `subagent-driven-development` |
| PR merge + handoff steps | `finishing-a-development-branch` |

### 2. Detection — onboard

`plugins/loop-stack/skills/onboard/onboard.mjs` gains a `detectIntegrations()` that checks the known
plugin install locations and sets a boolean:

- `~/.claude/plugins/cache/*/superpowers` (marketplace cache)
- `~/.claude/plugins/data/*superpower*` (installed data dir)

Result is recorded as `integrations.superpowers: true|false` in:
- the config object defaults (`defaultsFrom`, preserving any prior explicit value),
- the rendered `.claude/stack.md`,
- `stack.example.md` (documented example).

Detection must never throw (reuse the fail-soft posture of existing detectors); on any error it
yields `false`.

### 3. Touchpoint edits — reference the contract, never restate

- `skills/devfix/SKILL.md` — four one-line "if `${integrations.superpowers}`, invoke `superpowers:X`
  — see `shared/superpowers-integration.md`" notes at the TDD, debug, verify, and review phases.
  The Iron-Law checkpoints remain authoritative as the fallback.
- `loops/my-bugs-in-sprint-devfix.md` and `loops/pr-shepherd.md` — same one-liners at the agent
  fan-out and PR merge/handoff steps.
- `skills/launch-loop-stack/SKILL.md` — one-liner where agent teams fan out and at verify handoff.
- `MANIFEST.md` — a short "Superpowers integration (optional)" section pointing at the shared doc.
- `CONVENTIONS.md` — add the `${integrations.superpowers}` token → config mapping.

## Out of scope (YAGNI)

- No vendoring/copying of superpowers content.
- No `depends`/hard dependency in `plugin.json`.
- No edits to skills with weak overlap (memory-*, figma-*, css-drift).

## Verification

- `node --check plugins/loop-stack/skills/onboard/onboard.mjs`.
- Run `onboard.mjs` against this repo and a repo without superpowers; confirm `integrations.superpowers`
  is written correctly in both and the script exits 0.
- Grep that every touchpoint edit references `shared/superpowers-integration.md` rather than
  restating the contract.

## Versioning

Bump `loop-stack` to **1.3.0** in `plugin.json` and `marketplace.json` as the final step.
