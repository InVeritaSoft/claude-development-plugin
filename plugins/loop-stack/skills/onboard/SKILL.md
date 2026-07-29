---
name: onboard
description: Per-project setup for the loop stack — run at setup and re-run any time, like /init. Observes the project's real PR system and deployment system (git history, gh, workflow files, past session commands) plus the rest of the stack (issue tracker, package manager, frameworks, backend/DB, edge, tests) and writes .claude/stack.md — the single config every other skill, agent, command, and loop reads. Re-runs merge fresh observations with the existing config and surface conflicts. Use when bringing the loop stack to a new project, when the user says "onboard this project", "re-run onboarding", "refresh the stack config", "re-onboard", or when a skill reports that .claude/stack.md is missing.
---

# Onboarding

## Purpose

Make the loop stack portable. Run this at setup and **re-run any time** — like `/init`, re-running refreshes observations and merges them with your config (conflicts are prompted, never clobbered). It captures everything project-specific — issue tracker + how "my work" is queried, branch model, package manager, frameworks, backend/DB, edge runtime, test runners + e2e tag convention, CI/deploy workflows, design tool — into **`.claude/stack.md`** (plus a machine-readable `.claude/stack.json`).

Every other skill/agent/command/loop reads `.claude/stack.md` for these values. Nothing is hardcoded, so the same stack works in any repo. Anything left `none`/empty means "this project doesn't use it — skip those steps."

**Tracker-adaptive.** A "team" here is a **project/repo** — one `.claude/stack.md` per repo, bound to whatever tracker that project uses. Onboard treats **Jira, GitHub Issues, and Linear as co-equal first-class paths**: it seeds tracker-appropriate idioms (key prefix, `myWorkQuery`, states, transition, `reporter` handoff) so downstream skills read the same `${issueTracker.*}` tokens no matter the tool. GitHub Issues uses `open`/`closed` + labels (no transition ids) and `reporter` = the issue author; Linear transitions by state name and `reporter` = the creator. See the tracker-adaptive table in `CONVENTIONS.md`.

## When to use

- Bringing the loop stack to a new project for the first time.
- User says: "onboard this project", "set up the stack here", "configure for this repo", "re-run onboarding".
- Any skill reports `.claude/stack.md` is missing or incomplete.

## How to run

1. From the project root, run the bundled script:

   ```bash
   node <this-skill-dir>/onboard.mjs
   ```

   - It auto-detects what it can, then prompts you to confirm/fill the rest (Enter accepts each detected default).
   - `--detect-only` prints what it found and writes nothing (use it to preview).
   - `--non-interactive` writes using detected values + defaults (good for CI or a quick first pass).
   - Re-running loads the existing `.claude/stack.json` as defaults, so edits are preserved.

2. If you can't run Node interactively, do **guided onboarding** instead: run `node onboard.mjs --detect-only`, then walk the user through each field (see the sections in the generated `stack.md`) and write `.claude/stack.md` + `.claude/stack.json` yourself from their answers.

3. **Gap-fill what the script couldn't observe.** The run prints an observation report
   (`key = value [source]` / `[unobserved]`). For each `unobserved` PR or deploy field
   (e.g. non-GitHub host, no CLI auth), observe it yourself with whatever tools exist
   (host CLI, API, asking the user) and write the value into `.claude/stack.md` +
   `.claude/stack.json` like any other answer.

4. **PR + deploy sections must not end up empty.** Every project has a PR system and a
   deployment system. Do not finish onboarding with those sections `none`/`—` unless
   the user explicitly confirms the project truly lacks one.

5. Open **`.claude/stack.md`** and confirm the issue-tracker section especially — workflow **state names** and (for Jira) **transition ids** can't be auto-detected and matter most to the loops.

## After onboarding

- Tell the user the config path and that they can edit it any time or re-run this skill.
- If the project had no root `CLAUDE.md`, onboarding also drops the universal, config-driven
  `CLAUDE.template.md` as `./CLAUDE.md` (the entry point — invariants + skills map, all specifics
  read from `.claude/stack.md`). An existing `CLAUDE.md` is left untouched; merge from
  `skills/onboard/CLAUDE.template.md` if desired.
- Point them at `launch-loop-stack` to start the autonomous loops, now driven by their config.
- **No test harness?** If `${testing.e2e.runner}` or `${testing.unit.runner}` came out `none` (the project has
  no E2E/unit project yet), point the user at **`scaffold-test-projects`** to bootstrap a Gherkin-driven
  Playwright E2E project + a unit-tests project (page objects, typed web-element wrappers, hooks). After it
  runs, re-run `onboard` so the new runners/dirs/tag convention land in `.claude/stack.md`.

## Contract for every other skill

> Read `.claude/stack.md` at the start. Use its values; never assume a specific tool.
> If a needed section is `none`/empty, **skip** those steps (don't ask, don't invent).
> If `.claude/stack.md` is missing, tell the user to run `onboard` and stop.

**Except testing.** `${testing.*}` set to `none` is surfaced, not skipped: every implementation ends
with the full unit suite and the full E2E suite green, and an absent harness triggers the
`scaffold-test-projects` offer (Gherkin + page objects + typed web-element wrappers + hooks). The
rendered `## Testing` section of `stack.md` carries this line so every skill reading the config sees
it; the rule itself lives in `skills/shared/green-gate.md`.

See `CONVENTIONS.md` at the repo root for the full token → config mapping.
