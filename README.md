# dev-tools — Claude Code plugin marketplace

A Claude Code plugin marketplace with three plugins: **loop-stack** (a universal, config-driven autonomous dev loop stack), **css-drift-auditor** (a framework-agnostic pipeline for auditing and normalizing CSS/design drift), and **mobile-platform-guidelines** (iOS HIG + Material 3 rules for building native-feeling mobile UI).

## Install

```bash
# 1. Add this marketplace
/plugin marketplace add Lolibai/claude-development-plugin

# 2. Install what you need
/plugin install loop-stack@dev-tools
/plugin install css-drift-auditor@dev-tools
/plugin install mobile-platform-guidelines@dev-tools
```

## loop-stack — autonomous dev loop stack (universal)

A portable, **config-driven** set of skills, agents, commands, and loops that drive a "my work in the active iteration" workflow in **any** project: auto-fix assigned bugs → verify against AC + deploys → review requested PRs → shepherd your own PRs to merge → repair failed deployments → sync fix-base branches → sweep a small time-boxed batch of E2E scenarios each tick into a rolling suite-health report → daily standup report with parked-item escalation. Nothing is hardcoded; project specifics live in `.claude/stack.md`.

Bring it to a project:

```bash
# 1. Install the plugin (above), or copy plugins/loop-stack/{skills,agents,commands,loops} into the project's .claude/
# 2. Onboard once — detects your stack, writes .claude/stack.md, prepares .claude/loops/ (specs + gitignored state/)
node plugins/loop-stack/skills/onboard/onboard.mjs --non-interactive
# 3. Launch the loops (now driven entirely by your config)
#    → run the `launch-loop-stack` skill
```

Anything the config marks `none` is skipped (no CI → no deploy gate; GitHub Issues → no Jira transitions) — **except testing**: every implementation closes with the full unit suite and the full E2E suite green, and a missing harness is surfaced with an offer to scaffold one (Gherkin + page objects + typed web-element wrappers + hooks) rather than skipped. See [green-gate.md](./plugins/loop-stack/skills/shared/green-gate.md). See [plugins/loop-stack/MANIFEST.md](./plugins/loop-stack/MANIFEST.md) for the loop list and [plugins/loop-stack/CONVENTIONS.md](./plugins/loop-stack/CONVENTIONS.md) for how every file stays project-agnostic.

## css-drift-auditor

`css-drift-auditor` ([plugin readme](./plugins/css-drift-auditor/README.md)) renders every component in Storybook and reads **post-cascade computed styles** — the real pixel values after Tailwind, theme providers, CSS variables, and inheritance resolve — then clusters them into a token scale and flags low-usage outliers as drift. It also parses source into a mixed html + component tree (React `.tsx`/`.jsx` and Angular `*.component.ts`) to catch raw HTML tags carrying ad-hoc `className`, inline styles, or Tailwind arbitrary values — the elements that bypass the component layer, where drift concentrates. No Figma required.

Per-project prerequisites (Claude Code prompts before installing any of them):
- Storybook (`npx storybook@latest init`)
- Playwright (`npm i -D playwright && npx playwright install chromium`)
- `@babel/parser`, and `parse5` for Angular (`npm i -D @babel/parser parse5`)

## mobile-platform-guidelines

`mobile-platform-guidelines` ([plugin readme](./plugins/mobile-platform-guidelines/README.md)) is a skill that packages Apple's **Human Interface Guidelines** and Google's **Material Design 3** into an implementation-oriented, pattern-first workflow. Before any mobile screen, component, navigation flow, or permission prompt is written, it audits the proposed design against the relevant platform reference and lists violations — touch targets, safe areas, back-navigation, permission timing, dark mode, accessibility — so UI feels native on the platform it ships to. Works for React Native / Expo / Flutter / native. No per-project prerequisites.

## Repository layout

```
.claude-plugin/marketplace.json    # marketplace registry (loop-stack + css-drift-auditor + mobile-platform-guidelines)
plugins/loop-stack/                # the autonomous loop stack plugin
plugins/loop-stack/skills/onboard/      # onboard.mjs → writes .claude/stack.md + materializes .claude/loops/
plugins/loop-stack/{MANIFEST,CONVENTIONS}.md  # what the stack contains + how it stays universal
plugins/css-drift-auditor/         # the CSS-drift plugin
plugins/mobile-platform-guidelines/  # iOS HIG + Material 3 mobile UI skill
tests/                             # unit suite (node:test, zero dependencies)
.github/workflows/validate.yml     # CI: runs the unit suite
```

## Tests

No install step — the suite uses Node's built-in runner and asserts against throwaway fixture
projects:

```bash
node --test tests/*.test.mjs
```

It covers `onboard.mjs` (detection, rendered `stack.md`, fail-soft behavior, re-run safety), the
css-drift-auditor clustering rules and parser helpers, and repo invariants: every `.mjs` parses,
manifests are valid, plugin versions match between `plugin.json` and `marketplace.json`, and every
`skills/shared/*.md` reference resolves.

## License

MIT — see [LICENSE](./LICENSE).
