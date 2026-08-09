#!/usr/bin/env node
// Cut GitHub releases for any plugin whose version has been bumped but never released.
//
// Runs locally on purpose — GitHub Actions is not relied on for releasing.
// Zero dependencies (Node built-ins + `git` + `gh`), same rule as onboard.mjs.
//
//   node scripts/release.mjs --dry-run   # show what would be released, touch nothing
//   node scripts/release.mjs             # tag + push + create the releases
//   node scripts/release.mjs --plugin loop-stack
//   node scripts/release.mjs --remote origin        # just the one remote
//
// Tag scheme: <plugin>-v<version>, e.g. loop-stack-v1.5.0.
// The tag is placed on HEAD — release only from a commit that is already the
// intended state of main.
//
// This repo publishes to two remotes (origin = the README's install source,
// upstream = the org mirror). By default both are released to, and each remote
// is checked independently, so a remote that missed a version catches up on the
// next run.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_REMOTES = ['origin', 'upstream'];

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const DRY = args.includes('--dry-run');
const ONLY = flag('--plugin');

const run = (cmd, ...a) =>
  execFileSync(cmd, a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).trim();
const tryRun = (cmd, ...a) => {
  try { return run(cmd, ...a); } catch { return null; }
};

const die = (msg) => { console.error(`error: ${msg}`); process.exit(1); };

// ---------------------------------------------------------------- preflight

if (run('git', 'status', '--porcelain')) die('working tree is dirty — commit or stash first.');

// The loop-spec hash table is what lets onboard tell "unmodified, safe to refresh" from "the user
// edited this". A release that changes a spec without regenerating it ships a version no project
// can recognize, so that spec silently stops receiving fixes forever after. Regenerate and require
// the result to be identical to what is committed.
const genScript = fileURLToPath(new URL('./gen-spec-hashes.mjs', import.meta.url));
try { run(process.execPath, genScript); } catch (err) { die(`could not regenerate loops/.known-hashes.json: ${err.message}`); }
if (run('git', 'status', '--porcelain', 'plugins/loop-stack/loops/.known-hashes.json')) {
  die('loops/.known-hashes.json is stale — run `node scripts/gen-spec-hashes.mjs` and commit the result.');
}

const branch = run('git', 'rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== 'main') die(`on branch "${branch}" — releases are cut from main.`);

const configured = new Set(run('git', 'remote').split('\n').filter(Boolean));
const remotes = (flag('--remote') ? [flag('--remote')] : DEFAULT_REMOTES).filter((r) => {
  if (configured.has(r)) return true;
  if (flag('--remote')) die(`no remote named "${r}".`);
  return false; // a default remote that simply isn't set up here
});
if (remotes.length === 0) die(`none of the default remotes exist (${DEFAULT_REMOTES.join(', ')}).`);

const head = run('git', 'rev-parse', 'HEAD');

const repoFor = (remote) => {
  const url = run('git', 'remote', 'get-url', remote);
  const m = url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/);
  return m ? m[1] : die(`cannot parse a GitHub repo out of "${url}"`);
};

for (const remote of remotes) {
  run('git', 'fetch', remote, '--tags', '--quiet');
  const remoteHead = tryRun('git', 'rev-parse', `${remote}/main`);
  if (remoteHead !== head) {
    die(`HEAD (${head.slice(0, 8)}) differs from ${remote}/main (${(remoteHead || 'missing').slice(0, 8)}) — push main to ${remote} first.`);
  }
}

// ------------------------------------------------------- versions to publish

const marketplace = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
const declared = new Map(marketplace.plugins.map((p) => [p.name, p.version]));

const pluginsDir = join(ROOT, 'plugins');
const wanted = [];

for (const name of readdirSync(pluginsDir)) {
  if (ONLY && name !== ONLY) continue;
  const manifestPath = join(pluginsDir, name, '.claude-plugin', 'plugin.json');
  if (!existsSync(manifestPath)) continue;

  const { version } = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!version) die(`${name}: plugin.json has no version`);

  // The three-places-in-sync invariant: refuse to release a half-bumped version.
  const inMarketplace = declared.get(name);
  if (inMarketplace !== version) {
    die(`${name}: plugin.json says ${version} but marketplace.json says ${inMarketplace ?? '(absent)'} — sync them before releasing.`);
  }

  wanted.push({ name, version, tag: `${name}-v${version}` });
}
if (ONLY && wanted.length === 0) die(`no plugin named "${ONLY}" under plugins/.`);

// ------------------------------------------------------------------ releases

const previousTagFor = (name, exclude) => {
  // Highest existing version tag for this plugin (numeric, so v1.10.0 > v1.9.0).
  const tags = (tryRun('git', 'tag', '-l', `${name}-v*`, '--sort=-v:refname') || '')
    .split('\n').filter((t) => t && t !== exclude);
  return tags[0] || null;
};

const notesFor = ({ name, version, tag }, repo) => {
  const prev = previousTagFor(name, tag);
  const range = prev ? `${prev}..HEAD` : 'HEAD';
  const log = tryRun('git', 'log', '--no-merges', '--format=- %s', range, '--', `plugins/${name}`) || '';
  return [
    `### Changes${prev ? ` since ${prev}` : ''}`,
    '',
    log.trim() || '- No commits scoped to this plugin since the previous tag.',
    '',
    '### Install',
    '',
    '```',
    `/plugin marketplace add ${repo}`,
    `/plugin install ${name}@${marketplace.name}`,
    '```',
    '',
    `> Already installed? \`/plugin marketplace update ${marketplace.name}\`, then reinstall the plugin to pick up ${version}.`,
  ].join('\n');
};

let published = 0;

for (const remote of remotes) {
  const repo = repoFor(remote);
  // Must be fatal, not best-effort: a failed listing would look like "nothing is
  // released yet" and re-publish every version.
  const listed = tryRun('gh', 'release', 'list', '-R', repo, '--limit', '200', '--json', 'tagName', '--jq', '.[].tagName');
  if (listed === null) die(`cannot list releases for ${repo} — is gh authenticated and the repo reachable?`);
  const releasedTags = new Set(listed.split('\n').filter(Boolean));

  const todo = wanted.filter((w) => !releasedTags.has(w.tag));
  if (todo.length === 0) {
    console.log(`${remote} (${repo}): up to date — every plugin version is already released.`);
    continue;
  }

  for (const c of todo) {
    const notes = notesFor(c, repo);
    if (DRY) {
      console.log(`\n=== ${remote} (${repo}): would release ${c.tag} at ${head.slice(0, 8)} ===\n${notes}\n`);
      continue;
    }
    // Tag must exist on the remote BEFORE `gh release create`, or gh silently
    // creates it at the default-branch head instead of the commit we mean.
    if (!tryRun('git', 'rev-parse', '-q', '--verify', `refs/tags/${c.tag}`)) {
      run('git', 'tag', '-a', c.tag, '-m', c.tag);
    }
    run('git', 'push', remote, c.tag);
    execFileSync('gh', [
      'release', 'create', c.tag,
      '-R', repo,
      '--title', `${c.name} ${c.version}`,
      '--notes', notes,
      `--latest=${c === todo[todo.length - 1]}`,
    ], { cwd: ROOT, stdio: 'inherit' });
    console.log(`released ${c.tag} on ${repo}`);
    published++;
  }
}

if (DRY) console.log('(dry run — nothing was tagged, pushed, or published)');
else if (published === 0) console.log('Nothing to release.');
