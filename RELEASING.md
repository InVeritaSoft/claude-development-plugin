# Releasing

Every plugin version gets its own GitHub release. Releases are cut **locally** — this repo
deliberately does not depend on GitHub Actions for releasing.

Releases are published to **both** remotes, which carry identical tags and releases:

| Remote | Repo | Role |
|---|---|---|
| `origin` | `Lolibai/claude-development-plugin` | the install source cited in `README.md` |
| `upstream` | `InVeritaSoft/claude-development-plugin` | org mirror |

## Tag scheme

One tag per plugin per version: `<plugin>-v<version>`.

```
loop-stack-v1.5.0
css-drift-auditor-v0.4.2
mobile-platform-guidelines-v1.0.0
```

The root `marketplace.json` version is **not** a release axis — it has moved non-monotonically
across branch merges. Plugin versions are the unit that gets released.

## Cutting a release

1. Bump the version in **both** places (the invariant from `CLAUDE.md`): the plugin's
   `.claude-plugin/plugin.json` and its entry in the root `.claude-plugin/marketplace.json`.
2. Run the suite — this is what CI gates on:
   ```bash
   node --test tests/*.test.mjs
   ```
3. Commit and push `main` **to both remotes**:
   ```bash
   git push origin main && git push upstream main
   ```
4. Cut the release:
   ```bash
   node scripts/release.mjs --dry-run   # preview the notes, touch nothing
   node scripts/release.mjs             # tag + push + create the GitHub releases
   ```

`release.mjs` scans every `plugins/*/.claude-plugin/plugin.json` and, for each remote independently,
finds the versions that have no release yet. For those it creates the tag on `HEAD`, pushes it, and
opens a GitHub release whose notes are the commits scoped to that plugin's directory since its
previous tag. Versions already released on a given remote are skipped, so the script is safe to
re-run — and a remote that missed a version catches up on the next run rather than staying behind.

Scope a run with `--plugin <name>` or `--remote <name>`.

### What it refuses to do

- Release from a dirty working tree.
- Release from a branch other than `main`.
- Release when `HEAD` differs from any target remote's `main` (push first — the tag must point at a
  pushed commit).
- Release a plugin whose `plugin.json` and `marketplace.json` versions disagree.
- Continue when `gh release list` fails for a remote. That has to be fatal: an empty listing is
  indistinguishable from "nothing released yet", which would re-publish every version.

### One trap worth knowing

`gh release create` will happily invent a missing tag **at the default-branch head**, not at the
commit you meant. `release.mjs` therefore always pushes the tag before calling `gh`. Do the same if
you ever cut one by hand.

Requirements: `git`, and `gh` authenticated against the release remote. The script is
dependency-free (Node built-ins only), like `onboard.mjs`.

## Backfilled history

The 14 releases predating this process were backfilled on 2026-08-08. Each of those tags points at
the commit that *introduced* the version in `plugin.json`, and its notes say so. Note that
`loop-stack-v1.3.0` was only ever a side-branch state — mainline went 1.2.0 → 1.4.0 — so its tag sits
on the branch commit that declared it.
