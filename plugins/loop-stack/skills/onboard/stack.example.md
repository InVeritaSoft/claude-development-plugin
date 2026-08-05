# Project stack — `example (filled)`

> This is a fully-populated EXAMPLE showing what onboarding produces for a complex project.
> Your real config lives at `.claude/stack.md` (generated). Use this only as a reference.

## Project
- VCS host: **github**
- Repo: **YourOrg/YourRepo**
- Your username: **your-handle** (fallback only — gh commands use `@me`, the authenticated user, so shared config works for every team member)

## Issue tracker
- Tool: **jira**
- Connection: yourco.atlassian.net
- Ticket key prefix: PROJ
- "My active work" query: `assignee = currentUser() AND sprint in openSprints()`
- Issue types: bug=`Bug`, story=`Story` (+ Improvement, "Change Request")
- IMPLEMENT loop picks up: `Story`, `Task`
- States: todo=To Do, inProgress=In Progress, inReview=In Review, verify=Dev Testing, verified=Ready for Testing, done=Done
- Transition ids (if tracker needs them): {"In Progress":21,"Dev Testing":9,"Ready for Testing":2}
- On verify, reassign to: reporter

## Branching / PR model
- Integration branch: **develop**
- Env → branch: {"dev":"develop","stage":"stage"}
- Fix base branches: {"dev":"align-develop","stage":"align-stage"}
- Branch naming: `<type>/<KEY>`
- Auto-merge: squash · respect branch protection: **always**
- PR-review scope: reviewer=`your-handle`, watch authors=teammate-handle

## Commands
- Package manager: **pnpm** · install: `pnpm install`
- typecheck: `pnpm typecheck` · lint: `pnpm lint` · format: `pnpm format` · build: `pnpm build` · test: `pnpm test`
- Commit convention: conventional-commits · forbid AI-attribution in commits: yes

## Frontend
- Frameworks: react, angular
- Apps/packages: manager, admin, card, landing
- Styling: tailwind
- Conventions: components own their styles; flag raw HTML with ad-hoc className

## Backend / database
- Platform: **supabase** · migrations dir: backend/supabase/migrations · migrate cmd: supabase db push

## Serverless / edge
- Platform: **supabase-edge-deno** · functions dir: backend/supabase/functions · local restart: supabase stop && supabase start

## Testing
- Unit: **vitest** · locations: tests/ui-tests/src/unit/<app>
- E2E: **playwright** · dir: tests/ui-tests · tag: `@<KEY>-<n>` · bdd: npx bddgen
- Test-management sync: zephyr
- Green gate: **all unit tests green + all E2E green after every implementation** — full suites (no `--filter`, no `--grep`), run after the final edit, reported with the verbatim command + raw output. See `skills/shared/green-gate.md`.

## Vector memory / knowledge store
- Store: **qdrant** · collections: per-project; check memory before work · write decisions/fixes after

## CI / deploy
- CI host: **github-actions**
- Deploy workflows: {"dev":["deploy-backend-dev.yml","deploy-frontend-<app>-dev.yml"],"stage":["deploy-backend-stage.yml","deploy-frontend-<app>-stage.yml"]}
- Deploy platforms: docker, supabase
- Deploy gate before verify: yes · human-gated envs: prod

## Design
- Figma: yes · designs referenced by frame link in the ticket

## Reporting
- Daily report: yes · destination: **none** (= push notification only; or a channel / tracker page / issue to post the summary to) · hour: 16:58

## Compliance / data protection
- Regime: **HIPAA** (reviewers apply data-protection/sensitive-data checks only when this is not "none")

## Integrations
- Superpowers plugin: **yes** (when yes, skills prefer the superpowers process skills — TDD, systematic-debugging, verification-before-completion, requesting/receiving-code-review, dispatching-parallel-agents, finishing-a-development-branch — and fall back to the built-in checkpoints when no; see `skills/shared/superpowers-integration.md`)

## Project recovery / runbook notes
- Edge "module not found" cascade: if e2e mass-fails at /login, check `docker logs --since 3m <edge-container> | grep -c <module>`; >0 ⇒ full `supabase stop && supabase start`; =0 ⇒ refresh stale e2e auth storage state. Never mark an issue failed for an env/infra reason.
