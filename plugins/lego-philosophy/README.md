# lego-philosophy

One skill: build every UI screen from **named, reusable components** — a dumb (presentational) /
smart (container) split and a per-project component inventory — never from anonymous `<div>`
stacks. Framework-generic, with a per-framework mapping for **React, Vue, Angular and Svelte**.

Standalone and config-free — no `.claude/stack.md`, no loop-stack needed:

```
/plugin marketplace add InVeritaSoft/claude-development-plugin
/plugin install lego-philosophy@dev-tools
```

This is a framework-generalized edition. The loop-stack plugin ships its own config-driven
`lego-philosophy` skill (reads `${frontend.*}` from `.claude/stack.md`) that its agents reference;
the two are maintained separately.
