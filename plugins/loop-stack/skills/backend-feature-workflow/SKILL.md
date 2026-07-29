---
name: backend-feature-workflow
description: End-to-end, config-driven workflow for adding or modifying a backend feature (new RPC/HTTP router or procedure, new use case, new repository/adapter, new service). Enforces Clean Architecture layering (domain/application/infrastructure/presentation), context-injection DI (`ctx.services.*`), the service-layer rule (routers use services, never repositories), shared validation schemas by domain, sensitive-data encryption + audit middleware, and a pre-commit verification checklist driven by ${commands.*}. Reads .claude/stack.md for the backend/serverless platform, source dirs, and commands. Use when the user says "add backend feature", "new router", "new procedure", "new use case", "new repository", "new service", "wire up X", touches the backend core/functions source, or asks how backend layers fit together. For DB-only schema work prefer database-migration; for serverless/edge runtime config prefer serverless-function.
---

# Backend Feature Workflow

Canonical, **config-driven** guide for adding a backend feature. The layering, DI, and verification reasoning is project-agnostic; concrete platforms, dirs, and commands come from `.claude/stack.md`.

> **Read `.claude/stack.md` first.** Use its values; never assume a specific tool. Read `${backend.platform}`,
> `${edge.platform}`, the backend source dirs, and `${commands.*}` (typecheck/lint/build/test). Never hardcode
> a framework, ORM, or RPC library. If a needed capability is `none`/empty, skip those steps (e.g. if
> `${edge.platform}` is `none`, ignore the serverless-function-specific wiring and run the router inside your
> normal server). If `.claude/stack.md` is missing, run the **`onboard`** skill and stop. Concrete tools in
> the examples below (tRPC, Zod, Supabase, WebCrypto, Deno) are **examples** — match the configured stack.

## When to use

- New RPC/HTTP router, procedure, or endpoint
- New use case, entity, value object, service, or repository
- Refactoring that crosses `domain / application / infrastructure / presentation`
- Any change that touches `ctx.services.*` or the project's router source

## Architecture in one picture

```
┌─ Presentation (RPC/HTTP routers) ──── ctx.services.*Service ───┐
│                                                                 │
├─ Application (services, use cases) ──── repositories/ports ─────┤
│                                                                 │
├─ Infrastructure (adapters: DB / crypto / HTTP) ────────────────┤
│                                                                 │
└─ Domain (entities, value objects, ports) — NO dependencies ────┘
```

Dependencies flow inward only. Domain imports nothing from infrastructure. Routers never import adapters or repository implementations.

## The hard rules

1. **Routers use services, never repositories.** `ctx.services.profileService.findById(id)` — not `ctx.services.profileRepository.findById(id)`. Repositories are only touched inside service implementations (and at context wiring time).
2. **Context-injected DI only.** No module-level instantiation, no global DI container, no lazy singletons inside routers. Services live on `ctx.services` with lazy getters (see the shared context module of your serverless/server entry).
3. **Entities use private constructor + static factory.** Validate in constructor. Set `createdAt` and `updatedAt` inside the factory. `Entity.create(...)` — never `new Entity(...)` from outside.
4. **Repository ports accept data, not entities.** `create(data: CreateXData): Promise<X>` constructs the entity inside the repo. Don't pass already-built entities in.
5. **Shared validation schemas by domain.** Define in the project's shared schema module under a domain section header (using the configured validation library, e.g. Zod). Type inference (e.g. `z.infer<...>`) lives in the feature file, not the shared schema file.
6. **Enums via the validation library's native-enum helper** (e.g. `z.nativeEnum()`), dates as ISO strings via `.toISOString()`, UTC only (use the project's date helpers, e.g. `utcNow()`, `addDays()`).
7. **Sensitive data:** every sensitive/PII/PHI field encrypted at rest via `ctx.services.encryption.encrypt(...)` before persisting and decrypted on read. Every sensitive-data-mutating mutation wraps with the audit middleware (e.g. `createAuditMiddleware`). Never log raw sensitive data, passwords, tokens, or full session IDs (mask to first 8 chars).
8. **Generic error messages.** Use the RPC layer's typed errors (e.g. `TRPCError` with `UNAUTHORIZED | FORBIDDEN | NOT_FOUND | BAD_REQUEST | CONFLICT | INTERNAL_SERVER_ERROR`). Log internally with context; surface no user enumeration, no DB details, no stack traces.
9. **External services are optional.** Return `undefined` from the context getter when disabled or un-configured; guard with `if (ctx.services.crmService) { ... }` at call sites; non-blocking on failure.

## Phase map

Paths below are the **conventional** Clean-Architecture locations; map them onto the project's actual backend source dirs.

### Phase 1 — Domain (`<core>/domain/`)

- Entity in `domain/entities/` with private constructor + static `create(props, id?, createdAt?, updatedAt?)`.
- Value objects in `domain/value-objects/` — immutable, validate in constructor, `equals()` method; expose enums + `isValidXxx` type guards.
- Repository port interface in `domain/ports/repositories/` — accepts `CreateXData`, returns `Entity | null`, `Result<Entity>`, or `Entity[]`.
- Service port interface in `domain/ports/services/` (only if adding a new service).

### Phase 2 — Application / Service (`<core>/infrastructure/services/`)

- Implement service class against the port; constructor takes repositories it needs.
- Business logic lives here, not in routers.
- Return `Result<T>` (`success(entity)` / `failure('generic message')`) for fallible operations.

### Phase 3 — Infrastructure (`<core>/infrastructure/adapters/<db>/repositories/`)

- `XRepository implements IXRepository` for the configured DB platform (`${backend.platform}`).
- `rowToEntity` + `entityToRow` private methods handle mapping.
- Writes set `created_at` / `updated_at` from `entity.createdAt.toISOString()`.
- Lazy initialization only — no module-level `new DbClient(...)`.
- For sensitive fields store the encrypted blob, map to/from `encryptedX` property names on the entity.

### Phase 4 — Context wiring (the serverless/server shared context module)

- Wire repo → service → `services` object using lazy getters so env vars are read per-request, not at module load.
- Add the service type to `Services` in the shared types module.
- For external integrations (CRM, email, webhooks), the getter returns `undefined` when a disable flag is set (e.g. `DISABLE_EXTERNAL_SERVICES=true`) or the API key env var is missing — never throw from the getter.
- If `${edge.platform}` is `none`, do the equivalent wiring in your normal server's context/DI setup.

### Phase 5 — Shared schemas (the shared schema module)

Add under the correct domain section header (example uses Zod):

```typescript
// =============================================================================
// Order Domain Schemas
// =============================================================================

/**
 * Order Create Schema
 * Used when a user places a new order.
 */
export const OrderCreateSchema = z.object({
  firstName: z.string().min(1).max(100),
  status: z.nativeEnum(OrderStatus),
  dateOfBirth: DateOfBirthSchema,
});
```

Naming: `{Domain}{Action}Schema` for input, `{Domain}{Purpose}OutputSchema` for output. Common responses: `SuccessResponseSchema`, `SuccessWithIdResponseSchema`. Reuse shared primitives (`UUIDSchema`, `DateOfBirthSchema`, etc.). Type inference (`export type OrderCreateInput = z.infer<...>`) lives in the feature/router file, not here.

### Phase 6 — Router (the project's router source)

Skeleton (example uses tRPC + Zod):

```typescript
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { OrderStatus, addDays, utcNow } from '<core>';
import { OrderCreateSchema } from '<core>/shared/schemas';

export const orderRouter = router({
  create: protectedProcedure
    .use(createAuditMiddleware('ORDER_CREATE'))
    .input(OrderCreateSchema)
    .output(z.object({ success: z.boolean(), id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.services.orderService.create({
        ...input,
        ownerId: ctx.user.id,
      });

      if (!result.ok) {
        ctx.services.logger.warn('Order create failed', {
          userId: ctx.user.id,
          error: result.error,
        });
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unable to create order' });
      }

      ctx.services.logger.info('Order created', { orderId: result.value.id });
      return { success: true, id: result.value.id };
    }),
});
```

Procedure types follow the project's RPC setup: a public procedure (no auth) | a logged procedure (adds correlation) | a protected procedure (`ctx.user` guaranteed non-null) | an admin procedure (role check). Always log before throwing. Always use the native-enum helper in output schemas, never a raw string type for known enums.

### Phase 7 — Tests

- **Unit**: colocated per the project's unit-test convention (`${testing.unit.locations}`), run with `${testing.unit.runner}`; mock `ctx.services.*` when needed.
- **API / integration tests**: add the domain helper in the API-test support dir, register it on the test client, write scenarios + step defs that set **both** the response object **and** the HTTP status the assertions read. If your e2e/API stack generates step bindings, run that generation step (e.g. `${testing.e2e.bddStep}`) after editing features.

### Phase 8 — Pre-commit verification

Run the configured commands from the backend package:

```bash
${commands.typecheck}
${commands.lint}
${commands.build}
${commands.test}            # or the project's unit-test target
```

Then run the API/integration test target (`${commands.test}` or a narrower API suite if defined), targeting the touched feature where possible.

Boot check (if `${edge.platform}` ≠ none): start the local functions runtime and smoke-test a health endpoint (see `serverless-function` for the exact local-serve + `${edge.localRestart}` commands).

**Close with the green gate** (`.claude/skills/shared/green-gate.md`): the **full** unit suite and the **full** E2E suite green after the final edit — a backend change that greens the API tests but reddens a UI scenario is not done. If either suite doesn't exist, offer `scaffold-test-projects` (Gherkin + page objects + typed web-element wrappers + hooks) and record the outcome; don't skip silently.

Use the `double-check-code` skill for the final quality gate and `run-tests` for broader suite selection.

## Anti-patterns (reject immediately)

- `ctx.services.profileRepository.*` in a router → replace with `profileService`.
- `new XRepository(...)` at module scope → move into a lazy context getter.
- `const x = process.env.X!` (or `Deno.env.get('X')!`) → replace with an explicit check + a generic `INTERNAL_SERVER_ERROR` ("Server configuration error").
- A plain string enum schema for a TS enum → use the native-enum helper (e.g. `z.nativeEnum(Enum)`).
- `expiresAt.setTime(...)` / `new Date(Date.now() + N)` → `addDays(utcNow(), N).toISOString()` (project date helpers).
- Throwing from an optional external-service getter → return `undefined` instead.
- Logging raw sensitive data / full session token → mask to 8 chars or log only IDs.

## Related skills

- `database-migration` — Phase 1 DB schema + row-security + migration sync.
- `serverless-function` — Phase 4 runtime config / import map / request handling when the feature runs in a serverless/edge function.
- `principal-architect` — use proactively on cross-layer diffs.
- `devfix` — the full fix workflow that orchestrates this skill + tests + verify + push.
- `run-tests`, `double-check-code` — Phase 8 verification.
- `shared/green-gate.md`, `scaffold-test-projects` — the closing all-green gate and the harness bootstrap when a suite is missing.
