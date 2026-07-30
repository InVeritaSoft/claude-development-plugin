---
name: generate-tests-after-implementation
description: Generate comprehensive tests immediately after implementing code to verify correctness and prevent hallucinations. Use after implementing features, fixing bugs, or adding new functionality to ensure the code works as intended.
---

# Generate Tests After Implementation

## Purpose

Generate comprehensive tests immediately after implementing code to verify correctness and prevent hallucinations.

> **Read `.claude/stack.md` first; use its values; never assume a specific tool.** If a needed capability is `none`, skip those steps. If the config is missing, run the `onboard` skill and stop.

Use the configured runners and locations: unit runner `${testing.unit.runner}` (e.g. Vitest, Jest) at `${testing.unit.locations}`, E2E runner `${testing.e2e.runner}` (e.g. Playwright) at `${testing.e2e.dir}`, and the frontend stack in `${frontend.*}` (e.g. a React + Testing Library setup).

> **No runner is not a skip.** If `${testing.unit.runner}` or `${testing.e2e.runner}` is `none` there is nowhere to put these tests — offer `scaffold-test-projects` first (Gherkin `.feature` files, page objects, typed web-element wrappers, hooks), then come back and generate. See `.claude/skills/shared/green-gate.md`.
>
> New E2E coverage binds to **page objects**, never to raw selectors inline: the scenario calls an intent method (`loginPage.login(email, password)`), the page object holds typed web elements, and the web-element wrapper is the only place a locator is touched.

## When to Use

Use this skill after:
- Implementing new features
- Fixing bugs
- Adding new functionality
- Creating new API endpoints
- Adding new components or utilities

## Test Generation Workflow

### 1. Identify Test Scope
- Determine what needs testing:
  - Unit tests for functions/utilities
  - Integration tests for API endpoints
  - Component tests for UI elements
  - E2E tests for user flows

### 2. Test Structure
Follow project conventions from config:
- **Backend**: Use the unit runner `${testing.unit.runner}`; place tests in the project's API/integration test location or alongside code
- **Frontend**: Use the unit runner `${testing.unit.runner}` with the project's component-testing setup (per `${frontend.*}`); place under `${testing.unit.locations}`
- **Feature files**: Use Gherkin/BDD format when the project's E2E runner is BDD-driven (`${testing.e2e.bddStep}`)

### 3. Test Coverage
Ensure tests cover:
- **Happy path**: Normal operation
- **Edge cases**: Boundary conditions, empty inputs
- **Error cases**: Invalid inputs, error handling
- **Security**: Authorization, authentication, input validation

### 4. Test Data
- Use the project's own test-data generators / fixture utilities (e.g. a shared core/test-utils package)
- Follow the project's test-data format requirements (e.g. any domain ID/regex the project enforces)
- Ensure test data is isolated and doesn't affect other tests

### 5. Write Tests
- Write tests immediately after implementation
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)
- Mock external dependencies appropriately

## Test Types

### Unit Tests
Test individual functions/components in isolation:
```typescript
describe('functionName', () => {
  it('should handle normal case', () => {
    // Arrange
    const input = createTestData();
    // Act
    const result = functionName(input);
    // Assert
    expect(result).toEqual(expected);
  });
});
```

### Integration Tests
Test API endpoints with database:
```typescript
describe('POST /api/endpoint', () => {
  it('should create resource', async () => {
    const response = await caller.endpoint.create({ ... });
    expect(response).toMatchObject({ ... });
  });
});
```

### Component Tests
Test UI components with the project's component-testing tools (example assumes a React + Testing Library stack; adapt to `${frontend.frameworks}`):
```typescript
describe('ComponentName', () => {
  it('should render correctly', () => {
    render(<ComponentName {...props} />);
    expect(screen.getByText('...')).toBeInTheDocument();
  });
});
```

## Verification

After generating tests:
1. Run the new tests to ensure they pass
2. Verify test coverage is adequate
3. Check tests follow project conventions
4. Ensure tests are maintainable and readable
5. **Close with the green gate** — `.claude/skills/shared/green-gate.md`: the full unit suite and the
   full E2E suite green, not just the tests you just wrote. Fresh coverage that greens in isolation
   but breaks a sibling suite is not done.

## Related skills

- `shared/green-gate.md` — the closing gate: all units green + all E2E green, or offer the scaffold.
- `scaffold-test-projects` — bootstrap the harness when there's no runner to generate into.
- `run-tests` — execute the generated tests and broader suites.
- `double-check-code` — full quality gate; composes this skill + `run-tests`.
- `e2e-narrow-fail-focus-success` — when a newly-added E2E is red, triage there.
- `backend-feature-workflow` — Phase 7 of a backend feature calls into this skill.
- `frontend-component-conventions` — uses the single-React-instance Vitest setup required for frontend tests.
- `devfix` — Phase 3 verification; Coder subagent adds targeted tests via this skill.
