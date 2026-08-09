#!/usr/bin/env node
// Records the SHA-256 of every version of every loop spec this repo has ever shipped.
//
// onboard materializes loops/*.md into a project once and then never overwrites them — the
// project owns its specs, because they accumulate real project lessons. The cost of that rule
// is that a bug fixed upstream (a leaked issue key, a wrong instruction) never reaches a project
// that already onboarded.
//
// This closes it without risking anyone's edits: if a project's copy hashes to a version we
// once shipped, nobody has touched it, so refreshing it is lossless. If it hashes to anything
// else, it has local edits and is left alone. Distinguishing those two cases is the whole job,
// and it needs history — the current file alone cannot tell "outdated" from "customized".
//
// Regenerate before cutting a release (scripts/release.mjs runs this and refuses to release if
// the result is dirty, so a stale table can't ship):
//   node scripts/gen-spec-hashes.mjs
//
// No external dependencies — Node built-ins only.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_DIR = "plugins/loop-stack/loops";
const OUT = path.join(REPO_ROOT, SPEC_DIR, ".known-hashes.json");

// stdio "pipe" on stderr: a rename makes some <commit>:<path> lookups legitimately miss, and the
// resulting git "fatal:" chatter would drown the one line that matters.
const git = (...args) => execFileSync("git", args, { cwd: REPO_ROOT, encoding: "buffer", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

// Commit -> the path this file had AT that commit. Without this, every version from before a
// rename is invisible, and a project holding one of those older copies looks "customized" and
// never gets refreshed — the silent half of the bug this whole mechanism exists to fix.
function historyPaths(rel) {
  let out = "";
  try { out = git("log", "--follow", "--format=%H", "--name-only", "--", rel).toString("utf8"); } catch { return []; }
  const pairs = [];
  let commit = null;
  for (const line of out.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (/^[0-9a-f]{40}$/.test(t)) { commit = t; continue; }
    if (commit) { pairs.push([commit, t]); commit = null; }
  }
  return pairs;
}

const specs = fs.readdirSync(path.join(REPO_ROOT, SPEC_DIR)).filter((f) => f.endsWith(".md")).sort();
const files = {};

for (const name of specs) {
  const rel = `${SPEC_DIR}/${name}`;
  const hashes = new Set();

  // Every commit that touched this file, at whatever path it had then, plus the working-tree copy.
  for (const [commit, at] of historyPaths(rel)) {
    try { hashes.add(sha(git("show", `${commit}:${at}`))); } catch { /* absent at that commit */ }
  }
  hashes.add(sha(fs.readFileSync(path.join(REPO_ROOT, rel))));

  files[name] = [...hashes].sort();
}

// Deliberately no timestamp: the file must be byte-stable when nothing changed, or the release
// script's dirty-check would fire on every run and everyone would learn to pass --force.
const payload = {
  note: "SHA-256 of every shipped version of each loop spec. A project copy matching one of these is unmodified and safe to refresh; anything else has local edits and is never overwritten. Regenerate with scripts/gen-spec-hashes.mjs.",
  files,
};

fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n");
const total = Object.values(files).reduce((n, h) => n + h.length, 0);
console.log(`wrote ${path.relative(REPO_ROOT, OUT)}: ${specs.length} specs, ${total} known versions`);
