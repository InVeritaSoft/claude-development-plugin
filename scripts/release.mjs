#!/usr/bin/env node
// Cut GitHub releases for any plugin whose version has been bumped but never tagged.
//
// Runs locally on purpose — GitHub Actions is not relied on for releasing.
// Zero dependencies (Node built-ins + `git` + `gh`), same rule as onboard.mjs.
//
//   node scripts/release.mjs --dry-run   # show what would be released, touch nothing
//   node scripts/release.mjs             # tag + push + create the releases
//   node scripts/release.mjs --plugin loop-stack
//
// Tag scheme: <plugin>-v<version>, e.g. loop-stack-v1.5.0.
// The tag is placed on HEAD — release only from a commit that is already the
// intended state of main.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REMOTE = 'origin';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const ONLY = args.includes('--plugin') ? args[args.indexOf('--plugin') + 1] : null;

const run = (cmd, ...a) =>
  execFileSync(cmd, a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).trim();
const tryRun = (cmd, ...a) => {
  try { return run(cmd, ...a); } catch { return null; }
};

const die = (msg) => { console.error(`error: ${msg}`); process.exit(1); };

// ---------------------------------------------------------------- preflight

if (run('git', 'status', '--porcelain')) die('working tree is dirty — commit or stash first.');

const branch = run('git', 'rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== 'main') die(`on branch "${branch}" — releases are cut from main.`);

run('git', 'fetch', REMOTE, '--tags', '--quiet');
const head = run('git', 'rev-parse', 'HEAD');
const remoteHead = tryRun('git', 'rev-parse', `${REMOTE}/main`);
if (remoteHead !== head) {
  die(`HEAD (${head.slice(0, 8)}) differs from ${REMOTE}/main (${(remoteHead || 'missing').slice(0, 8)}) — push main first.`);
}

const repo = (() => {
  const url = run('git', 'remote', 'get-url', REMOTE);
  const m = url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/);
  return m ? m[1] : die(`cannot parse a GitHub repo out of "${url}"`);
})();

// ------------------------------------------------------- collect candidates

const marketplace = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
const declared = new Map(marketplace.plugins.map((p) => [p.name, p.version]));

const existingTags = new Set(run('git', 'tag', '-l').split('\n').filter(Boolean));

const pluginsDir = join(ROOT, 'plugins');
const candidates = [];

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

  const tag = `${name}-v${version}`;
  if (existingTags.has(tag)) continue; // already released
  candidates.push({ name, version, tag });
}

if (candidates.length === 0) {
  console.log(ONLY ? `${ONLY}: already released at its current version.` : 'Nothing to release — every plugin version is already tagged.');
  process.exit(0);
}

// ------------------------------------------------------------------ release

const previousTagFor = (name) => {
  // Highest existing version tag for this plugin (numeric, so v1.10.0 > v1.9.0).
  const tags = tryRun('git', 'tag', '-l', `${name}-v*`, '--sort=-v:refname');
  return tags ? tags.split('\n')[0] : null;
};

const notesFor = ({ name, version, tag }) => {
  const prev = previousTagFor(name);
  const range = prev ? `${prev}..HEAD` : 'HEAD';
  const log = tryRun('git', 'log', '--no-merges', '--format=- %s', range, '--', `plugins/${name}`) || '';
  const changes = log.trim() || '- No commits scoped to this plugin since the previous tag.';
  return [
    `### Changes${prev ? ` since ${prev}` : ''}`,
    '',
    changes,
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

for (const c of candidates) {
  const notes = notesFor(c);
  if (DRY) {
    console.log(`\n=== would release ${c.tag} at ${head.slice(0, 8)} ===\n${notes}\n`);
    continue;
  }
  run('git', 'tag', '-a', c.tag, '-m', c.tag);
  run('git', 'push', REMOTE, c.tag);
  execFileSync('gh', [
    'release', 'create', c.tag,
    '-R', repo,
    '--title', `${c.name} ${c.version}`,
    '--notes', notes,
    `--latest=${c === candidates[candidates.length - 1]}`,
  ], { cwd: ROOT, stdio: 'inherit' });
  console.log(`released ${c.tag}`);
}

if (DRY) console.log(`(dry run — ${candidates.length} release(s) would be created on ${repo})`);
