# Universal Frontend Implementation Instructions

Read `.claude/stack.md` first; use its values; never assume a specific tool; if a needed capability is `none`, skip those steps; if the config is missing, run the `onboard` skill and stop.

## Overview

Use these universal guidelines for implementing frontend features based on requirements or recommendations (e.g., in markdown or documentation). Match the project's configured frontend stack (`${frontend.frameworks}`, `${frontend.styling}`, apps `${frontend.apps}`). All implementations must be accompanied by comprehensive unit tests (with `${testing.unit.runner}`) in the project's test directory (`${testing.unit.locations}`).

## Step 0: Load Graph Context (mandatory)

Before reading any source files, run graphify to locate the affected modules and understand their relationships:

```bash
graphify query "<feature-area keyword — e.g. checkout payment plan step>"
# If a specific symbol is already known:
graphify path "<source-symbol>" "<target-symbol>"
```

Use the output to:
- Identify exact file paths and community clusters for the feature area
- Avoid grepping the whole tree — navigate directly to the relevant nodes
- Detect shared components, hooks, or services already covering the requirement

Skip only if the graphify CLI is unavailable — note it explicitly and fall back to grep.

## Step 0.5: Harvest → Brief (mandatory before any implementation)

Two phases run before Step 1, in order — the same contract the autonomous IMPLEMENT loop uses:

1. **Harvest.** When an issue key/URL is in play (`${issueTracker.tool}` ≠ none), dispatch the
   issue harvester agent (**Harvey**, `agents/issue-harvester.md`) for the full ticket context —
   description, comments, subtask/parent, Epic chain, related issues, linked docs pages, design
   links — as structured AC YAML. No issue key → skip this phase; the provided spec/requirements
   stand in for the harvest.
2. **Brief.** Dispatch the **architect** agent (**Archie**, `agents/architect.md`) with the
   harvest output (or the provided spec). Archie returns the **Architecture Brief** — scope
   verdict, layers, dependency constraints, contracts, reuse-vs-create, data/migration needs,
   compliance notes, risks. The brief is **binding**: implementation follows it, and the
   `architecture-reviewer` seat (Rex) verifies the diff against it. `needs-decomposition` →
   stop and report the suggested split instead of implementing (autonomous callers park the
   issue; interactive callers ask the user).

Steps 1–8 below are then executed under the brief's constraints.

## Step 0.6: Team Dispatch (non-trivial implementations)

Run the implementation as a **small subagent team** using the existing roster — not
single-threaded inline work — whenever the change spans more than one file or carries any brief
risk flag:

- **Cody** (`agents/coder.md`) implements from the Team Briefing = Harvey's AC + Archie's brief +
  this command's Steps 1–8 as the implementation standard.
- **Tess** (`agents/tester.md`) runs all affected suites after Cody returns.
- The review panel votes independently and must be **unanimous**: **Cleo**
  (`agents/clean-code-reviewer.md`), **Rex** (`agents/architecture-reviewer.md`, brief in hand),
  **Tia** (`agents/test-integrity-reviewer.md`).
- **Sol** (`agents/resolver.md`) consolidates any concerns into one pass, then Tess + the panel
  re-run.

When `${integrations.superpowers}` is set, fan the independent seats out per
`superpowers:dispatching-parallel-agents` — see `skills/shared/superpowers-integration.md`.
Trivial one-file changes may run inline, still under the brief.

## Step 1: Analyze and Understand Requirements

1. **Review inputs**: Carefully read any design, documentation, or specification files.
2. **Determine project scope**:
   - Identify affected applications and packages/modules.
   - List UI components/pages that must be created or updated.
3. **Clarify requirements**:
   - Interface, design, and user flow needs.
   - Data flow and integration points (APIs, contexts, etc.).
   - State management and flow.
   - Routing/navigation.
   - Accessibility considerations.
4. **Design tool** (when `${design.figma}` is configured — e.g. Figma):
    - If design links are provided in chat, use the design tool's MCP (navigating design links via a browser is forbidden) to extract context, gather design assets, and apply relevant tokens, variables, components, and accessibility specifications.
    - Always enrich the implementation and review with all available design-tool MCP features (inspecting layers, extracting CSS/variables, copying component specs, accessibility metadata, etc.).
    - Prioritize best practices in accessibility, typing, and test organization, drawing directly from all relevant information provided via the design-tool MCP.
    - **Audit the story's design references before building** with the `design-link-audit` skill. UI-shaped work with no usable design is an unstated specification: whoever implements it invents the visual spec, and the invention is only discovered at review. Report the verdict; when it is `gaps-found` on UI-shaped work, say what is missing instead of building past it silently.
    - If no design tool is configured, work from the assets/spec the user provides.

## Step 2: Directory Structure (Example)

Adjust the structure to fit your project’s organization, but maintain logical separation as shown below:

```
<frontend-root>/
├── apps/             # Application entry points (if monorepo)
│   └── <app>/src/
│       ├── pages/
│       └── components/
└── packages/         # Shared modules
    ├── shared-components/
    ├── shared-contexts/
    ├── shared-api/
    ├── shared-types/
    ├── shared-utils/
    └── shared-validation/
```

**Tests should mirror source structure:**

```
<test-root>/
└── src/
    ├── components/
    ├── pages/
    ├── shared/
    ├── mocks/
    └── utils.tsx
```

## Step 3: Universal Implementation Guidelines

### Component Development

1. **Location**  
   - Application-specific: `<frontend-root>/apps/<app>/src/components/`
   - Shared: `<frontend-root>/packages/shared-components/`

2. **Naming**  
   - Use PascalCase for files and exported components (e.g., `UserForm.tsx`).

3. **TypeScript**  
   - Define explicit Props interfaces or types.
   - Use shared types when available. Avoid `any`.

4. **Styling**  
   - Use your team’s/the project’s standard class-based styles (e.g., Tailwind CSS).
   - Adhere to existing layout and responsive patterns.

5. **Accessibility**  
   - Use semantic HTML.
   - Incorporate ARIA labels where appropriate.
   - Ensure keyboard navigation.
   - Always add `data-testid` where useful for testing.

### API/Data Integration

- Use designated client/data libraries for all API calls (e.g., tRPC, GraphQL, REST client).
- Handle all loading and error states with dedicated UI.
- All network or persistent state calls must be mockable.
- Respect project context/state injection patterns.

### State Management

- Use hooks (e.g., `useState`) for local state.
- Use context or shared state providers for cross-cutting state (e.g., Auth, User, global UI state).
- Avoid prop drilling when context or state sharing is more appropriate.

### Routing

- Use the project's routing standard (e.g., React Router v6).
  ```typescript
  import { Routes, Route, useNavigate } from 'react-router-dom';
  ```
- Define routes at the application level as per conventions.
- Use navigation hooks for redirection and navigation.

## Step 4: Universal Unit Test Strategy

> If `${integrations.superpowers}`, invoke `superpowers:test-driven-development` to drive this feature's tests (write the test around the intended behavior, watch it fail, implement to green), and `superpowers:systematic-debugging` when a test surfaces an unexpected failure — see `skills/shared/superpowers-integration.md`. Otherwise follow the strategy below. (`implement` is test-backed, not rigid-TDD like `devfix`.)

### Test Location

Place tests so that their path matches the implementation:

- Component: `<test-root>/src/components/__tests__/ComponentName.test.tsx`
- Page: `<test-root>/src/pages/__tests__/PageName.test.tsx`
- Shared: `<test-root>/src/shared/__tests__/SharedComponent.test.tsx`

### Test Organization and Requirements

- All external dependencies (API hooks, network calls, contexts, browser APIs, timers) must be mocked.
- Use project-provided testing utilities (e.g., `renderWithProviders`, `userEvent`, `screen`).
- Tests should cover:
  - Rendering and basic usage (happy path)
  - User interactions
  - Conditional/UI state changes (loading, error, empty, etc.)
  - Edge cases (bad input, error boundaries)
  - Accessibility and usability (keyboard navigation, ARIA)

**Sample universal test template** (shown with a common runner; use `${testing.unit.runner}`'s equivalents):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@tests/utils';
import ComponentName from '@/path/to/Component';

// Setup mock(s) needed in vi.mock
const { mockFunction } = vi.hoisted(() => ({
  mockFunction: vi.fn(),
}));

// Mock modules and APIs
vi.mock('@myorg/shared-api', () => ({
  api: {
    foo: {
      useQuery: vi.fn(() => ({
        data: mockData,
        isLoading: false,
        error: null,
      })),
    },
  },
}));

describe('ComponentName', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('Rendering', () => {
    it('renders', () => {
      renderWithProviders(<ComponentName />);
      expect(screen.getByTestId('component-name')).toBeInTheDocument();
    });
    // ...More rendering tests
  });

  describe('Interactions', () => {
    it('handles click', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      renderWithProviders(<ComponentName onClick={onClick} />);
      await user.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalled();
    });
    // ...More interaction tests
  });

  describe('Conditional rendering', () => {
    it('shows loading', () => {
      vi.mocked(api.foo.useQuery).mockReturnValue({ data: undefined, isLoading: true, error: null });
      renderWithProviders(<ComponentName />);
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
    // ...Other conditional states
  });
});
```

#### Universal Mocking: Patterns

```typescript
// vi.hoisted for hoisted mocks
const { mockFn } = vi.hoisted(() => ({
  mockFn: vi.fn(),
}));

// Mock modules
vi.mock('some-external-context', () => ({
  useAuth: vi.fn(() => mockAuthObject),
}));

// Mock API hooks
vi.mock('@myorg/shared-api', () => ({
  api: {
    data: {
      useQuery: vi.fn(() => ({
        data: mockData,
        isLoading: false,
        error: null,
      })),
    },
  },
}));
```

### Sample Patterns

#### Form Pattern

```typescript
// Component
export function ExampleForm({ onSubmit }: { onSubmit: (data: { name: string }) => void }) {
  const [formData, setFormData] = useState({ name: '' });
  return (
    <form
      onSubmit={e => { e.preventDefault(); onSubmit(formData); }}
      data-testid="example-form"
    >
      {/* form fields */}
    </form>
  );
}

// Test
it('submits form with data', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  renderWithProviders(<ExampleForm onSubmit={onSubmit} />);
  await user.type(screen.getByLabelText(/name/i), 'X');
  await user.click(screen.getByRole('button', { name: /submit/i }));
  expect(onSubmit).toHaveBeenCalledWith({ name: 'X' });
});
```

#### List Pattern

```typescript
export function ExampleList({ items }: { items: { id: string; label: string }[] }) {
  return (
    <ul data-testid="example-list">
      {items.map(item => (
        <li key={item.id} data-testid={`item-${item.id}`}>{item.label}</li>
      ))}
    </ul>
  );
}

// Test
it('renders items', () => {
  const items = [{ id: '1', label: 'A' }];
  renderWithProviders(<ExampleList items={items} />);
  expect(screen.getByTestId('item-1')).toHaveTextContent('A');
});
```

#### Modal/Dialog Pattern

```typescript
export function ExampleModal({ isOpen, onConfirm, onCancel }: any) {
  if (!isOpen) return null;
  return (
    <div data-testid="example-modal" role="dialog">
      <button onClick={onConfirm} data-testid="confirm-button">Confirm</button>
      <button onClick={onCancel} data-testid="cancel-button">Cancel</button>
    </div>
  );
}

// Test
it('calls onConfirm', async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  renderWithProviders(<ExampleModal isOpen onConfirm={onConfirm} onCancel={() => {}} />);
  await user.click(screen.getByTestId('confirm-button'));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});
```

## Step 5: Universal Verification Checklist

> If `${integrations.superpowers}`, run this gate through `superpowers:verification-before-completion` (evidence before any "done" claim) — see `skills/shared/superpowers-integration.md`. Otherwise verify the checklist below directly.

Before marking any implementation as complete, verify:

- [ ] Implementation in appropriate location
- [ ] Correct TypeScript usage and typings
- [ ] Consistent styling (per project's standards)
- [ ] Applied accessibility attributes and best practices
- [ ] All error/loading states handled
- [ ] Responsive design verified
- [ ] Test files correctly located and structured
- [ ] All external dependencies mocked in tests (NO real calls)
- [ ] Rendering, user interaction, and state tests written
- [ ] Edge and accessibility cases tested
- [ ] Type-checks pass (`${commands.typecheck}`) and lint is clean (`${commands.lint}`)
- [ ] **Green gate passed** (`.claude/skills/shared/green-gate.md`) — the **full** unit suite and the
      **full** E2E suite green after the final edit, each with its verbatim command and raw output.
      Not the changed package only; not the issue's tag subset only
- [ ] **If a suite doesn't exist**, the `scaffold-test-projects` offer was made (Gherkin + page
      objects + typed web-element wrappers + hooks) and the outcome recorded — an absent harness is
      never a silent skip
- [ ] Code follows existing project patterns

## Step 6: Running Tests (Typical)

Use the project's package manager (`${commands.packageManager}`) and test command (`${commands.test}`) from the test root. Example with a common runner:

```bash
# Run the project's UI/unit tests
cd <test-root>
${commands.test}

# Watch / coverage / single file — use the runner's flags, e.g.
${commands.test} --watch
${commands.test} --coverage
${commands.test} Example.test.<ext>
```

Those are the iteration loop. The **closing run** is the green gate — full suites, no narrowing:

```bash
${commands.test}                                                # FULL unit suite, repo root, no --filter
cd ${testing.e2e.dir} && ${testing.e2e.bddStep} && <e2e run command> --reporter=list   # FULL E2E, no --grep
```

Both must come back green before the implementation is reported done. If either runner is `none`,
don't skip it — offer `scaffold-test-projects` (Gherkin `.feature` files, page objects, typed
web-element wrappers, hooks) and record the outcome. Full contract:
`.claude/skills/shared/green-gate.md`.

## Step 7: Additional Guidance

- Refer to local or organization standards for more patterns and examples.
- Always check for and follow existing, similar code.
- Test files must always mock external dependencies.
- Use `data-testid` for reliable queries, but prefer roles and labels when possible.

## Step 8: Recurring Gotchas

Before assuming an infrastructure failure, **check the project's runbook notes (`${recoveryNotes}`)** for known, project-specific causes (e.g. duplicate test-runner versions in the package store, a BDD-gen step that must run from a specific dir, generated-file paths that must be ignored by the formatter, required fields in a seed helper, env/container restarts). Follow that runbook rather than marking work failed for an env/infra reason.

Generic, tool-agnostic gotchas that apply anywhere:

| Symptom | Root cause | Fix |
|---|---|---|
| E2E assertion uses a fixed sleep + a point-in-time visibility check | Brittle time-based wait | Prefer the runner's auto-retrying assertion with a timeout (e.g. `expect(locator).not.toBeVisible({ timeout: N })`) |
| Formatter/lint green locally, red on CI | Local runs against the working tree; CI against committed state | Stage all formatter rewrites before committing |
| Generated files flagged by the formatter | Generated dir not ignored | Add the generated dir to the formatter's ignore file |

## Resources

- Testing guidelines: see your project’s test rules or documentation
- TypeScript patterns
- API usage guides
- Existing test examples

## Notes

- Maintain consistency with the existing codebase
- Mirror source file structure with test files
- Mock all external dependencies in tests without exception
- Favor best practices in accessibility, typing, and test organization