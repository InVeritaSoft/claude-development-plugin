// Shared test helpers. Zero-dependency, Node built-ins only — the same constraint
// onboard.mjs and the css-drift-auditor scripts are held to, so `node --test` runs
// on a fresh clone with no install step.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const ONBOARD = path.join(REPO_ROOT, "plugins/loop-stack/skills/onboard/onboard.mjs");
export const ANALYZE_DRIFT = path.join(REPO_ROOT, "plugins/css-drift-auditor/scripts/analyze-drift.mjs");
export const DETECT_FRAMEWORK = path.join(REPO_ROOT, "plugins/css-drift-auditor/scripts/detect-framework.mjs");

const tmpDirs = [];

/**
 * Create a throwaway project directory. `files` maps relative paths to contents
 * (objects are JSON-stringified); a path ending in "/" creates an empty dir.
 * Registered for cleanup via cleanupTmpProjects().
 */
export function tmpProject(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dev-tools-test-"));
  tmpDirs.push(dir);
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(dir, rel);
    if (rel.endsWith("/")) {
      fs.mkdirSync(full, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof contents === "string" ? contents : JSON.stringify(contents, null, 2));
  }
  return dir;
}

export function cleanupTmpProjects() {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
}

/** Run a script with cwd set to a fixture dir. Never throws on non-zero exit — assert on the result. */
export function runScript(script, { cwd, args = [], env = {} } = {}) {
  const res = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
    // A bare fixture dir has no git remote and no gh/jira CLIs. That is the point:
    // detection must degrade, not crash. Keep PATH so git itself is still reachable.
    env: { ...process.env, ...env },
  });
  return { status: res.status, stdout: res.stdout || "", stderr: res.stderr || "", all: (res.stdout || "") + (res.stderr || "") };
}

export const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), "utf8");
export const readJSON = (dir, rel) => JSON.parse(read(dir, rel));
export const exists = (dir, rel) => fs.existsSync(path.join(dir, rel));

/** The `## Testing` block of a rendered stack.md, without the surrounding sections. */
export function stackMdSection(md, heading) {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}
