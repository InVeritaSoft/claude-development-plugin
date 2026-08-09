# dev-tools — Claude Code plugin marketplace

A Claude Code plugin marketplace with four plugins: **loop-stack** (a universal, config-driven autonomous dev loop stack), **css-drift-auditor** (a framework-agnostic pipeline for auditing and normalizing CSS/design drift), **mobile-platform-guidelines** (iOS HIG + Material 3 rules for building native-feeling mobile UI), and **shared-database-discipline** (rules for one shared Postgres/MongoDB behind many projects).

## Install

```bash
# 1. Add this marketplace
/plugin marketplace add Lolibai/claude-development-plugin

# 2. Install what you need
/plugin install loop-stack@dev-tools
/plugin install css-drift-auditor@dev-tools
/plugin install mobile-platform-guidelines@dev-tools
/plugin install shared-database-discipline@dev-tools
```

Already installed? `/plugin install` on an existing plugin is a no-op, and third-party marketplaces
have auto-update **off** by default — so a new version never arrives on its own. Refresh the catalog,
then update the plugin:

```bash
/plugin marketplace update dev-tools          # in-session: refresh this marketplace's listings
claude plugin update loop-stack@dev-tools     # shell: update the installed plugin (restart to apply)
/reload-plugins                               # or apply it in the running session
```

There is no `/plugin update` slash command — updating happens via the shell command above, or through
`/plugin` → **Marketplaces** tab (where you can also flip on auto-update for `dev-tools`).

Current versions: **loop-stack 1.6.0**,
**css-drift-auditor 0.4.2**, **mobile-platform-guidelines 1.0.0**,
**shared-database-discipline 1.0.0**. Loop specs are materialized into
a project by the `onboard` skill, so after updating, **re-run `onboard`** in each project to pick up
new loops — it never overwrites a spec you've edited.

## loop-stack — autonomous dev loop stack (universal)

A portable, **config-driven** set of skills, agents, commands, and loops that drive a "my work in the active iteration" workflow in **any** project: auto-fix assigned bugs → implement sprint stories behind a mandatory architect brief (Harvest → Brief → small agent team) → verify against AC + deploys → review requested PRs → shepherd your own PRs to merge → repair failed deployments → sync fix-base branches → sweep a small time-boxed batch of E2E scenarios each tick into a rolling suite-health report → daily standup report with parked-item escalation. Nothing is hardcoded; project specifics live in `.claude/stack.md`.

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

## shared-database-discipline

`shared-database-discipline` ([plugin readme](./plugins/shared-database-discipline/README.md)) is a skill for the setup where **one** Postgres and **one** MongoDB serve every project on a host or network, rather than each repository shipping its own database container — the common shape for homelabs, small teams and single-server deployments. It triggers before a database is added to a project, before a compose file grows a `postgres:` service, when `DATABASE_URL` / `MONGO_URI` / `ConnectionStrings` are wired up, and when a deploy runs on a self-hosted runner. It covers one database per project **per environment** isolated with `REVOKE CONNECT` rather than by agreement, the three-role model (`_owner` migrates, `_app` runs, `_ro` reads) so an injection cannot `DROP TABLE`, the connection-string formats that silently break (Npgsql rejects `postgresql://` URIs; semicolon-bearing values are destroyed by `source`), and self-hosted-runner safety — starting with never triggering on `pull_request`, which would make a fork's PR arbitrary code execution on your network. Tool-agnostic: host names, ports and the provisioning CLI are placeholders.

## Repository layout

```
.claude-plugin/marketplace.json    # marketplace registry (all four plugins)
plugins/loop-stack/                # the autonomous loop stack plugin
plugins/loop-stack/skills/onboard/      # onboard.mjs → writes .claude/stack.md + materializes .claude/loops/
plugins/loop-stack/{MANIFEST,CONVENTIONS}.md  # what the stack contains + how it stays universal
plugins/css-drift-auditor/         # the CSS-drift plugin
plugins/mobile-platform-guidelines/  # iOS HIG + Material 3 mobile UI skill
plugins/shared-database-discipline/  # one shared Postgres/Mongo behind many projects
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
