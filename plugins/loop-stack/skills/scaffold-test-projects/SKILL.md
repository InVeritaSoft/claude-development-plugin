---
name: scaffold-test-projects
description: Scaffold a project's automated-test foundation from scratch — an E2E project (Playwright + playwright-bdd, Gherkin .feature files) and a unit-tests project — with page objects, typed web-element wrappers, and hooks. Gherkin is mandatory; Playwright is the base E2E runner. Config-driven: reads ${testing.*}, ${frontend.*}, ${commands.*}, and ${backend.*}/${edge.*} from .claude/stack.md. Use when a project has no E2E or unit test harness yet, when the user says "set up e2e", "scaffold tests", "create a test project", "add page objects / hooks / gherkin", "bootstrap the test suite", or when onboarding detects no test runner. For fixing/greening an existing E2E suite use e2e-narrow-fail-focus-success; for running suites use run-tests.
---

# Scaffold Test Projects (E2E + Unit)

Bootstraps the automated-test foundation for a project that has little or none: a **Gherkin-driven
E2E project** and a **unit-tests project**, built on named, reusable building blocks — **page
objects**, typed **web-element wrappers**, and **hooks** — never ad-hoc selectors sprinkled through
step files.

> **Base stack: Playwright + [playwright-bdd] (Gherkin `.feature` files). Gherkin is a MUST.**
> Even when `${testing.e2e.runner}` names another tool, the Gherkin layer stays; Playwright + playwright-bdd
> is the default the scaffold assumes unless config says otherwise.

> **Read `.claude/stack.md` first; use its values; never assume a specific tool.** Read `${testing.e2e.*}`
> (runner/dir/bddStep/tagConvention — default Playwright, `tests/ui-tests`, `npx bddgen`, `@<KEY>-<n>`),
> `${testing.unit.*}` (runner/locations — default the project's configured runner, e.g. Vitest/Jest),
> `${frontend.frameworks}` + `${frontend.apps}`, `${commands.*}` (package manager + scripts), and the app URLs
> from `${frontend.apps}`. If `.claude/stack.md` is missing, run **`onboard`** first and stop. If a project
> already has a populated E2E/unit harness, this skill is a no-op for that half — report it and route to
> `e2e-narrow-fail-focus-success` (green an existing suite) or `run-tests` (run one).

## When to use

- A repo with no `tests/` E2E project, or unit tests scattered/absent.
- User says: "scaffold tests", "set up e2e", "create the test project", "add page objects", "add hooks",
  "bootstrap gherkin", "we need a BDD harness".
- `onboard` detected `${testing.e2e.runner}` / `${testing.unit.runner}` as `none` and the user wants them created.

## Fork the adoption framework before hand-rolling anything

For a **.NET** application — and for any project that wants a container-first suite it can adopt
rather than assemble — start from the E2E Adoption Framework instead of scaffolding from zero:

```bash
git clone git@github.com:Lolibai/e2e-adoption.git
cd e2e-adoption && ./e2e.sh run --rm e2e dotnet test    # green on arrival against a bundled demo app
/e2e-onboard                                            # recon → council → materialize around YOUR app
```

It is Reqnroll (Gherkin) + Playwright, DDD-layered, and container-first: no host .NET SDK, no host
Playwright browsers, no host Node — the pinned versions live in the image. `/e2e-onboard` reconnoiters
the target app with a set of recon subagents, deliberates in a council (architecture, safety, flake),
then materializes the framework around the real app and verifies it. Its harness drives Claude through
the **Claude Code subscription**, not a metered API key.

**Choose it when:** the app under test is .NET; or you want a suite that is green before it is
customized (a bundled demo app means "the harness works" and "my app works" are separately
falsifiable); or several projects need onboarding from one control plane.

**Choose the from-scratch scaffold below when:** the project is Node/TypeScript and already has a
package manager, CI, and conventions the suite must match — forking a .NET solution into it would
add a toolchain nobody there maintains.

Either way the non-negotiables below still hold: Gherkin, page objects, typed element wrappers,
lifecycle in hooks. The adoption framework already implements all four — that is the point of
preferring it. What it does **not** do is decide for you: run its `doctor` preflight and read its
`e2e.profile.yaml` before adopting, so the harness's assumptions about auth, data, and environments
are ones this project can actually meet.

## Non-negotiables

1. **Gherkin mandatory.** Every E2E behavior is expressed as a `.feature` scenario; steps bind to page objects, never to raw selectors inline.
2. **Page Object Model.** One page object per screen/route; it exposes intent methods (`login(email, pass)`), not selectors.
3. **Typed web-element wrappers.** Selectors live behind a small `WebElement` abstraction (click/fill/expectVisible with auto-wait), so a markup change touches one line.
4. **Hooks own lifecycle.** Setup/teardown, auth storage-state, data seeding, and tag-driven pre-scenario state live in hooks/fixtures — **never** copied into step files (the CLAUDE-level rule: tag-driven hooks, no per-scenario "I am signed out" steps).
5. **Config-driven paths.** Everything reads `${testing.*}` / `${commands.*}`; the concrete names below are the Playwright + playwright-bdd baseline.

---

## Deliverable A — E2E project (Playwright + playwright-bdd)

### Layout (baseline; adapt dirs to `${testing.e2e.dir}`)

```
${testing.e2e.dir}/                     # e.g. tests/ui-tests
  playwright.config.ts                  # projects per app from ${frontend.apps}, baseURLs, storageState
  bddgen.config.* (or defineBddConfig)  # feature glob -> generated specs dir
  package.json                          # scripts: test:e2e, bddgen (uses ${commands.packageManager})
  e2e/
    features/                           # .feature files (Gherkin) — the source of truth
      <app>/<flow>.feature
    steps/                              # step defs — thin; delegate to page objects
      <flow>.steps.ts
    pages/                              # Page Objects (one per screen/route)
      <Screen>.page.ts
    elements/                           # typed WebElement wrappers + component elements
      web-element.ts
      <Component>.element.ts
    hooks/
      scenario-hooks.ts                 # Before/After/BeforeAll; tag-driven setup
      fixtures.ts                       # playwright-bdd fixtures (page objects injected)
    support/
      selectors.ts | test-data.ts | env.ts
```

### Core building blocks (create these first, in order)

**1. `WebElement` wrapper** — the single place a Playwright `Locator` is touched:

```ts
// e2e/elements/web-element.ts
import { Locator, expect } from '@playwright/test';

export class WebElement {
  constructor(private readonly locator: Locator, readonly name: string) {}
  async click()             { await this.locator.click(); }
  async fill(value: string) { await this.locator.fill(value); }
  async text()              { return (await this.locator.textContent())?.trim() ?? ''; }
  async expectVisible()     { await expect(this.locator, `${this.name} visible`).toBeVisible(); }
  async expectHidden()      { await expect(this.locator, `${this.name} hidden`).toBeHidden(); }
}
```

**2. Page Object** — intent methods over web elements, no selectors leaking to steps:

```ts
// e2e/pages/Login.page.ts
import { Page } from '@playwright/test';
import { WebElement } from '../elements/web-element';

export class LoginPage {
  constructor(private readonly page: Page) {}
  private readonly email    = new WebElement(this.page.getByTestId('login-email'), 'email');
  private readonly password = new WebElement(this.page.getByTestId('login-password'), 'password');
  private readonly submit   = new WebElement(this.page.getByRole('button', { name: 'Sign in' }), 'submit');

  async goto()                                  { await this.page.goto('/login'); }
  async login(email: string, password: string)  {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }
}
```

**3. Fixtures** — inject page objects so steps stay thin (playwright-bdd `test.extend`):

```ts
// e2e/hooks/fixtures.ts
import { test as base } from 'playwright-bdd';
import { LoginPage } from '../pages/Login.page';

export const test = base.extend<{ loginPage: LoginPage }>({
  loginPage: async ({ page }, use) => { await use(new LoginPage(page)); },
});
export const { Given, When, Then } = createBdd(test); // import createBdd from 'playwright-bdd'
```

**4. Hooks** — lifecycle + tag-driven pre-scenario state (mirror the project's existing convention; do NOT duplicate cookie logic into steps):

```ts
// e2e/hooks/scenario-hooks.ts
import { BeforeAll, Before, After } from 'playwright-bdd';

BeforeAll(async () => { /* seed shared data / ensure services up */ });
Before({ tags: '@anon' }, async ({ context }) => {   // tag-driven: clear auth for anon flows
  await context.clearCookies();
  await context.addInitScript(() => localStorage.clear());
});
After(async ({ page }, testInfo) => {
  if (testInfo.status !== 'passed') await page.screenshot({ path: `artifacts/${testInfo.title}.png` });
});
```

**5. Feature + steps** — Gherkin drives; steps delegate:

```gherkin
# e2e/features/auth/login.feature
@auth
Feature: Sign in
  Scenario: valid credentials land on the dashboard
    Given I am on the login page
    When I sign in with valid credentials
    Then I see the dashboard
```

```ts
// e2e/steps/login.steps.ts
import { Given, When, Then } from '../hooks/fixtures';
Given('I am on the login page', async ({ loginPage }) => { await loginPage.goto(); });
When('I sign in with valid credentials', async ({ loginPage }) => { await loginPage.login('user@example.test', 'Passw0rd!'); });
Then('I see the dashboard', async ({ page }) => { await page.getByRole('heading', { name: 'Dashboard' }).waitFor(); });
```

> Use only synthetic/placeholder test data in features and steps — never real user data.

### Wire-up

- `playwright.config.ts`: one Playwright *project* per `${frontend.apps}` entry (baseURL from its dev port), `testDir` = generated specs dir from bddgen, `storageState` per authenticated project.
- `defineBddConfig({ features: 'e2e/features/**/*.feature', steps: 'e2e/steps/**/*.ts' })`.
- Scripts (in `${testing.e2e.dir}/package.json`, using `${commands.packageManager}`):
  `"bddgen": "bddgen"`, `"test:e2e": "bddgen && playwright test"`, matching `${testing.e2e.bddStep}`.
- Tag convention: `${testing.e2e.tagConvention}` (e.g. `@<KEY>-<n>`) so scenarios key back to issues.

**CHECKPOINT E2E-SCAFFOLD** · REQUIRES: `${testing.e2e.bddStep}` generates specs with zero errors AND one smoke `.feature` runs green (`test:e2e` filtered to `@auth` or a trivial scenario) · ON FAIL: fix config/fixtures before adding more features.

---

## Deliverable B — Unit-tests project

### Layout (adapt to `${testing.unit.locations}`)

```
${testing.unit.locations}/              # e.g. tests/ui-tests/src/unit/<app>  (or co-located __tests__)
  <area>/__tests__/<Unit>.test.<ext>
  support/
    render.tsx   | test-utils          # renderWithProviders + a single framework instance
    factories.ts | builders            # synthetic data builders
```

### Building blocks

- **Test utils** — one `renderWithProviders` (or framework equivalent from `${frontend.frameworks}`) wrapping the app's providers/theme/router; a single framework instance per run.
- **Data builders** — small factory functions producing synthetic fixtures; never inline literals repeated across tests.
- **Structure mirrors source** — test path matches implementation path (component ↔ `__tests__/Component.test`).
- Mock all external dependencies (network, contexts, timers) — no real calls.

```ts
// support/render.tsx  (React + Vitest baseline; swap per ${frontend.frameworks}/${testing.unit.runner})
import { render } from '@testing-library/react';
export function renderWithProviders(ui: React.ReactNode) {
  return render(<AppProviders>{ui}</AppProviders>);
}
```

### Wire-up

- Config for `${testing.unit.runner}` (e.g. `vitest.config.ts` / `jest.config.*`) with the test glob under `${testing.unit.locations}`, jsdom/happy-dom environment, and setup file importing testing-library matchers.
- Scripts: `"test:unit": "${testing.unit.runner} run"`, `"test:unit:watch"`, `"test:unit:coverage"` — surface via root `${commands.test}`.

**CHECKPOINT UNIT-SCAFFOLD** · REQUIRES: one example `*.test` runs green under `${testing.unit.runner}` and `${commands.typecheck}` passes · ON FAIL: fix config/test-utils before generating more tests.

---

## Finish

1. Update root `package.json` / turborepo pipeline so `${commands.test}` reaches both new projects.
2. Report what was created, the two green smoke checkpoints, and the commands to run each suite.
3. If `onboard` had `${testing.*}` as `none`, tell the user to **re-run `onboard`** so `.claude/stack.md` records the new runners/dirs/tag convention.

## Related

- `shared/green-gate.md` — the post-implementation gate that routes here: when the full-unit /
  full-E2E run finds no harness, it offers exactly this scaffold and records `suggested-scaffold`.
- `e2e-narrow-fail-focus-success` — green an existing E2E suite one feature at a time (use after scaffolding).
- `run-tests` — pick and run the right suite.
- `generate-tests-after-implementation` — add tests for freshly written code.
- `onboard` — records `${testing.*}` in `.claude/stack.md`; references this skill when no runner is configured.

[playwright-bdd]: the Playwright BDD integration that generates Playwright specs from Gherkin `.feature` files.
