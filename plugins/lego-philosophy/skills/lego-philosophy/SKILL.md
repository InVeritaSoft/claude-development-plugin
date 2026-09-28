---
name: lego-philosophy
description: The LEGO philosophy for frontend UI architecture in React, Vue, Angular, Svelte and similar component frameworks — build every screen from named, reusable components (dumb presentational + smart container split), never from anonymous div/template stacks. Use BEFORE writing or editing any UI: a component, screen, page, card, form, modal, list row, badge, or section header — and whenever you are about to type `<div className="...">`, `<div class="...">` or an inline template block.
---

# LEGO Philosophy

Every UI feature is built from two layers, like LEGO bricks snapping together. **Raw `<div>`
stacking is a last resort, not a starting point.** A screen is assembled from *named* components,
not from anonymous element trees.

The principle is framework-agnostic. Use the idioms of whatever the project already uses (see the
mapping below); the class examples assume utility CSS such as Tailwind but apply equally to CSS
modules, SCSS, or styled components. No configuration is needed — infer the framework, the
component library, and the folder layout from the repo.

## The one rule

**Before you write a `<div>` with classes, ask: *does a component for this already exist?***

- **Yes** → import and use it. Never inline what already exists.
- **No** → name it and extract it. Then use the named component.

If the same markup appears twice anywhere in the codebase, that is a defect, not a style choice —
extract it. Duplicated primitives, option lists, validation schemas, or constants are the same
defect.

## The two layers

**Dumb components (presentational).** Receive only inputs. Zero data-fetching, zero business logic,
zero API calls, no router access. They are reusable, testable in isolation, and live in the shared
component library (a cross-app package) or a feature's local `components/` folder. **Every
repeating visual pattern — a card, a badge, a field row, a section header, an icon+label — must
become a named dumb component.**

**Smart components (containers).** Own exactly one concern: data-fetching **or** orchestration
**or** routing. They call the data layer, derive state, then pass flat inputs down to dumb
children. One smart component per feature entry point; dumb components below it. A smart component
contains almost no markup of its own — it renders a tree of dumb components.

### How the two layers look per framework

| | Dumb (inputs only) | Smart (one concern) |
|---|---|---|
| **React** | function component taking props; no `useQuery`/`fetch`/`useNavigate` inside | page/feature component that calls hooks (`useQuery`, `useMutation`, router hooks) and returns dumb children |
| **Vue** | SFC with `defineProps` + `defineEmits`; no store, no `fetch`, no `useRoute` | SFC/composable-backed view that owns the store/query/route and passes props down |
| **Angular** | component with `@Input()`/`@Output()` (or `input()`/`output()`), `OnPush`, no injected data services | container component that injects the service/store, then binds to dumb children |
| **Svelte** | component with `export let` / `$props()`; no `fetch`, no `load` data | route/page component that owns `load` data or stores and passes props down |

Data flows down through inputs; events flow up through callbacks/emits/outputs. A dumb component
never reaches for data itself.

Placement:
- Reusable cross-app pieces → the shared component library.
- App-specific variants → that app's `components/` folder.
- Smart containers → `pages/`, `views/`, `routes/`, or `features/` (whatever the project calls them).

## The component inventory (per project)

A shared component library only pays off if it is discoverable. **Maintain an inventory** — a table
of the shared/primitive components (name → import → "use for") so anyone (you included) checks it
before stacking divs. Keep it in the project's `CLAUDE.md`, the shared library's `README`, or a
`COMPONENTS.md` — wherever the project already documents conventions.

Before writing any markup, scan that inventory. A match exists → use it. No match, but the pattern
repeats → add the component **and** add its row to the inventory. The inventory is part of "done,"
not an afterthought.

(This skill deliberately ships **no** fixed component list — each project's primitives differ. The
inventory is the project's, kept current by whoever touches the UI.)

## Red flags — stop and refactor when you see

- A file with more than ~3 levels of nested anonymous `<div>` blocks.
- The same class / style pattern copied between two components.
- A `<div>` that wraps an icon + a label — that is a component.
- A `<div>` that renders a card with a border and a title — that is a component.
- Inline `style` on anything other than a truly dynamic, runtime-computed value.
- A duplicated option list, constant, or validation schema — import the canonical one instead.
- A "dumb" component that imports a data client, store, or router — it is secretly smart.

## Checklist (run before merging any UI change)

- [ ] Checked the project's component inventory before writing markup.
- [ ] No raw/anonymous `<div>` stacking as a starting point; every repeating pattern is a named
      dumb component.
- [ ] Dumb components take inputs only — no fetching, business logic, API calls, stores, or router.
- [ ] Each smart component owns exactly one concern and renders mostly a dumb-component tree.
- [ ] Any newly extracted shared component is added to the inventory.
- [ ] No duplicated primitives, constants, option lists, or validation schemas.
