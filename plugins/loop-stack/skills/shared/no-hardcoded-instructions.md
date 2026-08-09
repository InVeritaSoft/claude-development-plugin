# No hardcoded instructions in generated per-project files (single source of truth)

> Applies to everything written **into a target project**: `.claude/stack.md`, `.claude/stack.json`,
> the root `CLAUDE.md`, `.claude/loops/*.md`, and — most dangerously — the **cron prompt text**
> registered by `launch-loop-stack`. Other skills reference this file; they never restate it.

## The failure this prevents

An autonomous loop is supposed to *ask the tracker what to work on* every tick. If the generated
artifact instead contains **the answer** — the four issue keys that were open when onboarding ran —
the loop looks completely healthy and is dead. It ticks on schedule, reports work, touches the same
frozen set forever, and never picks up anything new. Nothing errors. Nothing warns. The only symptom
is that new work is silently never started, which is invisible until someone asks why a ticket sat
untouched for a day.

This is the single most expensive mistake in the stack, because the loop's whole value proposition —
"it keeps up with my board" — is exactly what breaks, and the failure mode is *silence*.

## The rule

**Generated files carry the QUERY, never the RESULT.**

| Write this | Never this |
|---|---|
| `${issueTracker.myWorkQuery}` | the keys that query returned today |
| "bugs in `${states.todo}` for the current user + active iteration" | `PROJ-141, PROJ-152, PROJ-158, PROJ-160` |
| `gh pr list --author "@me"` | PR numbers `#412, #415` |
| `${vcs.integrationBranch}` | `feature/PROJ-141-checkout` |
| `@me` / the host's authenticated user | a committed username |
| `${commands.test}` | `pnpm vitest run src/checkout` |
| `${issueTracker.keyPrefix}` + `<KEY>` | a real key from a real project |

The same rule applies to *counts and lists*: "the 4 issues in the sprint" is a snapshot too. A
generated file must not know how many there are.

## Where the snapshot sneaks in

Resolution happens at **generation time** by accident, in these three places specifically:

1. **Cron prompt text.** The launcher composes the prompt for each loop. If it resolves
   `${issueTracker.myWorkQuery}` "to be helpful" and inlines the current keys, every future tick runs
   against that frozen list. **Cron prompts must contain the token or the query — never its output.**
2. **A worked example.** Illustrating a step with a key from the live board bakes that key into the
   project's copy. Examples use `<KEY>` / `${issueTracker.keyPrefix}-<n>`, never a real value.
3. **"Detected" values that are really *current state*.** Detecting the package manager is
   configuration. Detecting the current branch, the open PRs, or the sprint contents is state, and
   state must be re-read per tick, not written down.

## Self-check before writing any per-project file

- [ ] No literal issue key, PR number, or run id appears anywhere in the generated text.
- [ ] No literal list or count of work items.
- [ ] Every work-selection step names a query or a `${...}` token.
- [ ] Every example uses a placeholder (`<KEY>`, `<app>`, `<n>`), not a value from this project.
- [ ] Identity is `@me` / resolved-at-runtime, not a committed username.
- [ ] Anything that changes between two ticks is *read* at tick time, not embedded.

If a value would be wrong tomorrow, it does not belong in a generated file.

## Verification (do it, don't assume it)

After generating, grep what you wrote:

```bash
grep -nE "\b[A-Z][A-Z0-9]{1,9}-[0-9]{1,5}\b" .claude/stack.md .claude/loops/*.md CLAUDE.md
```

Every hit must be a placeholder (`<KEY>`, `CHECKPOINT-2`, `PROJ-123` in a documented example), never
a key that exists on the real board. `onboard.mjs` runs this check automatically and warns; the check
is a backstop for the human, not a substitute for not doing it in the first place.

Loops that are already registered are worth the same check — read back a cron's prompt text and
confirm it still contains the token, not a list. A loop that was correct at launch and got "helpfully"
rewritten later fails exactly the same way.
