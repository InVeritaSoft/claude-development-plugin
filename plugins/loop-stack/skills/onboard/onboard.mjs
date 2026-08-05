#!/usr/bin/env node
// onboard.mjs — per-project stack onboarding (re-runnable, /init-style) for the loop stack.
//
// Detects what it can from the repo, asks you to confirm/fill the rest, then writes
//   .claude/stack.json   (canonical machine-readable config)
//   .claude/stack.md     (human + Claude readable view; every skill reads THIS)
//
// After this runs once, the loop-stack skills/agents/commands/loops read the config
// instead of asking project-specific questions. Re-run any time to update it.
//
// Usage:
//   node onboard.mjs                 interactive (default)
//   node onboard.mjs --detect-only   print what was auto-detected, write nothing
//   node onboard.mjs --non-interactive [--yes]   use detected + defaults, no prompts
//   node onboard.mjs --out <dir>     output dir (default: .claude)
//   node onboard.mjs --root <dir>    project root to scan (default: cwd)
//
// No external dependencies — Node built-ins only.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Where this script lives. MUST go through fileURLToPath: on Windows, `new URL(import.meta.url).pathname`
// yields "/D:/dir", and path.resolve then prefixes the cwd drive → "D:\D:\dir" (a path that never exists),
// so every copy step below would silently take its fail-soft branch. It also decodes percent-escapes,
// which a raw pathname leaves mangled for any install path containing a space.
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const ROOT = path.resolve(opt("--root", process.cwd()));
const OUT = path.resolve(ROOT, opt("--out", ".claude"));
const DETECT_ONLY = has("--detect-only");
const NON_INTERACTIVE = has("--non-interactive") || has("--yes");
const DASH = "—"; // em dash, used in rendered output

// ---------- small helpers ----------
const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const exists = (p) => fs.existsSync(path.resolve(ROOT, p));
const tryExec = (cmd) => { try { return execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; } };
const listWorkflows = () => { try { return fs.readdirSync(path.resolve(ROOT, ".github/workflows")); } catch { return []; } };

const pkg = readJSON(path.resolve(ROOT, "package.json")) || {};
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
const dep = (name) => Object.keys(deps).some((d) => d === name || d.startsWith(name + "/") || d.startsWith("@" + name));

// ---------- detection ----------
function detectVcs() {
  const url = tryExec("git remote get-url origin");
  let host = "", repo = "";
  const m = url.match(/(?:github\.com|gitlab\.com|bitbucket\.org)[/:]([^/]+\/[^/.]+)(?:\.git)?/i);
  if (m) repo = m[1];
  if (/github\.com/i.test(url)) host = "github";
  else if (/gitlab/i.test(url)) host = "gitlab";
  else if (url) host = "other";
  const branch = tryExec("git symbolic-ref --short HEAD") || tryExec("git rev-parse --abbrev-ref HEAD");
  const username = tryExec("gh api user --jq .login");
  return { host: host || "github", repo, username, currentBranch: branch };
}
function detectPkgManager() {
  if (exists("pnpm-lock.yaml")) return "pnpm";
  if (exists("yarn.lock")) return "yarn";
  if (exists("bun.lockb")) return "bun";
  if (exists("package-lock.json")) return "npm";
  return pkg.packageManager ? pkg.packageManager.split("@")[0] : "npm";
}
function detectFrontend() {
  const fw = [];
  if (dep("react") || dep("next")) fw.push("react");
  if (dep("@angular")) fw.push("angular");
  if (dep("vue") || dep("nuxt")) fw.push("vue");
  if (dep("svelte")) fw.push("svelte");
  let styling = "none";
  if (dep("tailwindcss") || exists("tailwind.config.js") || exists("tailwind.config.ts")) styling = "tailwind";
  else if (dep("styled-components")) styling = "styled-components";
  else if (dep("@emotion")) styling = "emotion";
  let apps = [];
  for (const dir of ["apps", "packages", "frontend"]) {
    try { apps.push(...fs.readdirSync(path.resolve(ROOT, dir)).filter((d) => { try { return fs.statSync(path.resolve(ROOT, dir, d)).isDirectory(); } catch { return false; } }).map((d) => `${dir}/${d}`)); } catch {}
  }
  return { frameworks: fw, styling, apps };
}
function detectBackend() {
  if (exists("supabase") || dep("supabase")) return { platform: "supabase", migrationsDir: exists("backend/supabase/migrations") ? "backend/supabase/migrations" : "supabase/migrations" };
  if (exists("prisma/schema.prisma") || dep("prisma")) return { platform: "prisma", migrationsDir: "prisma/migrations" };
  if (dep("drizzle-orm")) return { platform: "drizzle", migrationsDir: "drizzle" };
  return { platform: "none", migrationsDir: "" };
}
function detectEdge() {
  if (exists("backend/supabase/functions") || exists("supabase/functions")) return { platform: "supabase-edge-deno", functionsDir: exists("backend/supabase/functions") ? "backend/supabase/functions" : "supabase/functions" };
  if (exists("netlify/functions")) return { platform: "netlify", functionsDir: "netlify/functions" };
  if (dep("aws-lambda") || exists("serverless.yml")) return { platform: "lambda", functionsDir: "" };
  return { platform: "none", functionsDir: "" };
}
function detectTesting() {
  const unit = dep("vitest") ? "vitest" : dep("jest") ? "jest" : dep("mocha") ? "mocha" : "none";
  const e2e = (dep("@playwright/test") || dep("playwright")) ? "playwright" : dep("cypress") ? "cypress" : "none";
  const bdd = (dep("playwright-bdd") || dep("@cucumber/cucumber")) ? "npx bddgen" : "";
  let e2eDir = "";
  for (const d of ["tests/ui-tests", "e2e", "tests/e2e", "cypress"]) if (exists(d)) { e2eDir = d; break; }
  return { unit, e2e, e2eDir, bdd };
}
function detectCi() {
  const wf = listWorkflows();
  const deploy = wf.filter((f) => /deploy/i.test(f));
  return { host: wf.length ? "github-actions" : "none", deployWorkflows: deploy };
}

// Optional plugin integrations. Fail-soft: any error yields false, never throws.
function detectIntegrations() {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const hit = (dir) => { try { return fs.readdirSync(dir).some((e) => /superpower/i.test(e)); } catch { return false; } };
  const bases = home ? [path.join(home, ".claude/plugins/cache"), path.join(home, ".claude/plugins/data")] : [];
  let superpowers = false;
  for (const base of bases) {
    if (hit(base)) { superpowers = true; break; }
    let subs = [];
    try { subs = fs.readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(base, e.name)); } catch { subs = []; }
    if (subs.some(hit)) { superpowers = true; break; }
  }
  return { superpowers };
}

// ---------- observation ----------
const RANK = { gh: 3, glab: 3, git: 2, files: 2, sessions: 1 };
const OBS_FIELDS = ["integrationBranch", "mergeStyle", "branchNaming", "envBranches", "reviewers", "mergeMethods", "branchProtected", "environments", "humanGatedEnvs", "ciHost", "deployWorkflows", "deployPlatforms", "recentWorkflows", "cmdTest", "cmdBuild", "cmdLint", "cmdTypecheck", "migrateCmd", "localRestart"];
const obsEmpty = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);
const setObs = (o, key, value, source) => {
  if (obsEmpty(value)) return;
  if (o[key] && RANK[o[key].source] > RANK[source]) return;
  o[key] = { value, source };
};
const safeRef = (s) => (/^[\w./-]+$/.test(s) ? s : "");

function observeGit(o) {
  const head = safeRef((tryExec("git remote show origin").match(/HEAD branch:\s*(\S+)/) || [])[1] || "");
  if (head) setObs(o, "integrationBranch", head, "git");
  const ref = head ? "origin/" + head : (safeRef(tryExec("git symbolic-ref --short HEAD")) || "HEAD");
  const total = Number(tryExec("git rev-list --count --first-parent --max-count=200 " + ref)) || 0;
  const merges = Number(tryExec("git rev-list --count --merges --first-parent --max-count=200 " + ref)) || 0;
  if (total >= 10) setObs(o, "mergeStyle", merges / total > 0.3 ? "merge" : "squash", "git");
  const remote = tryExec('git branch -r --format="%(refname:short)"').split("\n").map((b) => b.replace(/^origin\//, "").trim()).filter((b) => b && !b.includes("HEAD"));
  const ENV = { develop: "dev", dev: "dev", staging: "stage", stage: "stage", production: "prod", prod: "prod" };
  const envB = {};
  for (const b of remote) if (ENV[b] && b !== head) envB[ENV[b]] = b;
  setObs(o, "envBranches", envB, "git");
  const prefixes = {};
  for (const b of remote) { const p = b.match(/^([a-z]+)\//); if (p) prefixes[p[1]] = (prefixes[p[1]] || 0) + 1; }
  const top = Object.entries(prefixes).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 3) {
    const sample = remote.filter((b) => b.startsWith(top[0] + "/"));
    const keyLike = sample.filter((b) => /\/[A-Z]+-\d+/.test(b)).length > sample.length / 2;
    setObs(o, "branchNaming", keyLike ? "<type>/<KEY>" : "<type>/<slug>", "git");
  }
}

function observeGh(o, repo) {
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !tryExec("gh auth status 2>&1 && echo ok")) return;
  let prs = []; try { prs = JSON.parse(tryExec("gh pr list --state merged --limit 30 --json baseRefName,headRefName,reviews")); } catch {}
  if (prs.length) {
    const bases = {};
    for (const p of prs) bases[p.baseRefName] = (bases[p.baseRefName] || 0) + 1;
    setObs(o, "integrationBranch", Object.entries(bases).sort((a, b) => b[1] - a[1])[0][0], "gh");
    const rev = {};
    for (const p of prs) for (const r of p.reviews || []) if (r.author && r.author.login) rev[r.author.login] = (rev[r.author.login] || 0) + 1;
    setObs(o, "reviewers", Object.entries(rev).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([l]) => l), "gh");
  }
  try {
    const s = JSON.parse(tryExec("gh api repos/" + repo + " --jq '{squash:.allow_squash_merge,merge:.allow_merge_commit,rebase:.allow_rebase_merge}'"));
    const methods = Object.entries(s).filter(([, v]) => v).map(([k]) => k);
    setObs(o, "mergeMethods", methods, "gh");
    if (methods.length === 1) setObs(o, "mergeStyle", methods[0], "gh");
  } catch {}
  const ib = o.integrationBranch && o.integrationBranch.value;
  if (safeRef(ib)) {
    const prot = tryExec("gh api repos/" + repo + "/branches/" + ib + " --jq .protected");
    if (prot === "true" || prot === "false") setObs(o, "branchProtected", prot === "true", "gh");
  }
  try {
    const envs = JSON.parse(tryExec("gh api repos/" + repo + "/environments --jq '[.environments[].name]'"));
    setObs(o, "environments", envs, "gh");
  } catch {}
  try {
    const gated = JSON.parse(tryExec("gh api repos/" + repo + "/environments --jq '[.environments[] | select((.protection_rules | length) > 0) | .name]'"));
    setObs(o, "humanGatedEnvs", gated, "gh");
  } catch {}
  try {
    const runs = JSON.parse(tryExec("gh run list --limit 50 --json workflowName"));
    setObs(o, "recentWorkflows", [...new Set(runs.map((r) => r.workflowName).filter(Boolean))], "gh");
  } catch {}
}

function observeFiles(o) {
  let wfs = []; try { wfs = fs.readdirSync(path.resolve(ROOT, ".github/workflows")).filter((f) => /\.ya?ml$/.test(f)); } catch {}
  const envOf = (s) => (/prod/i.test(s) ? "prod" : /stag/i.test(s) ? "stage" : /dev/i.test(s) ? "dev" : "");
  const BR_ENV = { develop: "dev", dev: "dev", staging: "stage", stage: "stage", production: "prod", prod: "prod" };
  const wfByEnv = {}, envB = {};
  for (const f of wfs) {
    if (!/deploy|release|publish/i.test(f)) continue;
    let txt = ""; try { txt = fs.readFileSync(path.resolve(ROOT, ".github/workflows", f), "utf8"); } catch {}
    const pm = txt.match(/(?:^|\n)([ \t]*)push:[ \t]*\n((?:\1[ \t]+.*\n?|[ \t]*\n)*)/);
    const pushBlock = pm ? pm[2] : "";
    const bm = pushBlock.match(/branches:\s*(?:\[([^\]]*)\]|((?:\n\s*-\s*.+)+))/);
    const branches = bm ? (bm[1] !== undefined ? bm[1].split(",") : bm[2].split("\n").map((l) => l.replace(/\s*-\s*/, ""))).map((s) => s.trim().replace(/['"]/g, "")).filter(Boolean) : [];
    const env = envOf(f) || (branches[0] ? BR_ENV[branches[0]] || "" : "");
    (wfByEnv[env || "default"] = wfByEnv[env || "default"] || []).push(f);
    if (env && branches[0]) envB[env] = branches[0];
  }
  setObs(o, "deployWorkflows", wfByEnv, "files");
  setObs(o, "envBranches", envB, "files");
  if (wfs.length) setObs(o, "ciHost", "github-actions", "files");
  else if (exists(".gitlab-ci.yml")) setObs(o, "ciHost", "gitlab-ci", "files");
  else if (exists("bitbucket-pipelines.yml")) setObs(o, "ciHost", "bitbucket-pipelines", "files");
  const PLATFORMS = [["vercel", "vercel.json"], ["netlify", "netlify.toml"], ["fly", "fly.toml"], ["render", "render.yaml"], ["heroku", "Procfile"], ["docker", "Dockerfile"], ["docker", "compose.yaml"], ["docker", "docker-compose.yml"], ["serverless", "serverless.yml"], ["supabase", "supabase/config.toml"], ["supabase", "backend/supabase/config.toml"], ["gae", "app.yaml"], ["cloudflare", "wrangler.toml"]];
  setObs(o, "deployPlatforms", [...new Set(PLATFORMS.filter(([, p]) => exists(p)).map(([n]) => n))], "files");
}

function observeSessions(o) {
  const dir = path.join(process.env.HOME || "", ".claude", "projects", ROOT.replace(/[/.]/g, "-"));
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"))
      .map((f) => { const p = path.join(dir, f); const st = fs.statSync(p); return { p, m: st.mtimeMs, size: st.size }; })
      .filter((f) => f.size < 25 * 1024 * 1024).sort((a, b) => b.m - a.m).slice(0, 20);
  } catch { return; }
  const freq = {};
  for (const { p } of files) {
    let txt = ""; try { txt = fs.readFileSync(p, "utf8"); } catch { continue; }
    for (const line of txt.split("\n")) {
      if (!line.includes('"Bash"')) continue;
      try {
        for (const c of ((JSON.parse(line).message || {}).content || [])) {
          if (c && c.type === "tool_use" && c.name === "Bash" && typeof (c.input || {}).command === "string" && c.input.command.length < 500) {
            const cmd = c.input.command.trim();
            freq[cmd] = (freq[cmd] || 0) + 1;
          }
        }
      } catch {}
    }
  }
  const ranked = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const pick = (re) => ranked.find((c) => re.test(c) && !c.includes("&&") && !c.includes("|")) || "";
  setObs(o, "cmdTest", pick(/^(pnpm|yarn|bun run|npm run|npx)\s+(run\s+)?(test|vitest|jest)\b/), "sessions");
  setObs(o, "cmdBuild", pick(/^(pnpm|yarn|bun run|npm run)\s+(run\s+)?build\b/), "sessions");
  setObs(o, "cmdLint", pick(/^(pnpm|yarn|bun run|npm run|npx)\s+(run\s+)?(lint|eslint)\b/), "sessions");
  setObs(o, "cmdTypecheck", pick(/^(pnpm|yarn|bun run|npm run|npx)\s+(run\s+)?(typecheck|tsc)\b/), "sessions");
  setObs(o, "migrateCmd", pick(/^(supabase db push|npx prisma migrate|pnpm .*migrate|npm run .*migrate)/), "sessions");
  setObs(o, "localRestart", pick(/^(supabase stop|docker compose (up|down|restart))/), "sessions");
  const merge = ranked.find((c) => /^gh pr merge\b/.test(c));
  if (merge) { const m = merge.match(/--(squash|merge|rebase)\b/); if (m) setObs(o, "mergeStyle", m[1], "sessions"); }
}

function observe(d) {
  const o = {};
  observeGit(o);
  if (d.vcs.host === "github") observeGh(o, d.vcs.repo);
  observeFiles(o);
  observeSessions(o);
  return o;
}

function renderObservedReport(o) {
  const L = ["Observed (value [source]):"];
  for (const k of OBS_FIELDS) L.push("  " + k + " = " + (o[k] ? JSON.stringify(o[k].value) + "  [" + o[k].source + "]" : "[unobserved]"));
  return L.join("\n");
}

const OBS_MAP = [
  ["integrationBranch", ["vcs", "integrationBranch"]],
  ["mergeStyle", ["vcs", "autoMerge"]],
  ["branchNaming", ["vcs", "branchNaming"]],
  ["envBranches", ["vcs", "envBranches"]],
  ["ciHost", ["ci", "host"]],
  ["deployWorkflows", ["ci", "deployWorkflows"]],
  ["humanGatedEnvs", ["ci", "humanGatedEnvs"]],
  ["deployPlatforms", ["ci", "deployPlatforms"]],
  ["cmdTest", ["commands", "test"]],
  ["cmdBuild", ["commands", "build"]],
  ["cmdLint", ["commands", "lint"]],
  ["cmdTypecheck", ["commands", "typecheck"]],
  ["migrateCmd", ["backend", "migrateCmd"]],
  ["localRestart", ["edge", "localRestart"]],
];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const cfgEmpty = (v) => obsEmpty(v) || v === "none" || (typeof v === "object" && v !== null && !Array.isArray(v) && Object.values(v).every(obsEmpty));

function mergeObserved(cfg, obs, prev) {
  const filled = [], conflicts = [];
  for (const [key, pathArr] of OBS_MAP) {
    const ob = obs[key];
    if (!ob) continue;
    const parent = pathArr.slice(0, -1).reduce((n, k) => n[k], cfg);
    const leaf = pathArr[pathArr.length - 1];
    const prevVal = prev ? pathArr.reduce((n, k) => (n ? n[k] : undefined), prev) : undefined;
    if (cfgEmpty(prevVal)) {
      if (!same(parent[leaf], ob.value)) { parent[leaf] = ob.value; filled.push({ path: pathArr.join("."), value: ob.value, source: ob.source }); }
    } else if (!same(prevVal, ob.value)) {
      if (ob.source === "sessions") continue;
      conflicts.push({ pathArr, path: pathArr.join("."), current: prevVal, observed: ob.value, source: ob.source });
    }
  }
  return { filled, conflicts };
}

function detect() {
  const vcs = detectVcs();
  return {
    vcs,
    packageManager: detectPkgManager(),
    frontend: detectFrontend(),
    backend: detectBackend(),
    edge: detectEdge(),
    testing: detectTesting(),
    ci: detectCi(),
    integrations: detectIntegrations(),
  };
}

// ---------- config assembly ----------
// Tracker-adaptive presets. Jira, GitHub Issues, and Linear are co-equal first-class paths;
// each project picks one (one .claude/stack.md per repo). `reporter` handoff means "the issue
// opener" for every tracker (Jira reporter / GitHub issue author / Linear creator).
const TRACKER = {
  jira: {
    keyPrefix: "",
    myWorkQuery: "assignee = currentUser() AND sprint in openSprints()",
    states: { todo: "To Do", inProgress: "In Progress", inReview: "In Review", verify: "Dev Testing", verified: "Ready for Testing", done: "Done" },
    handoff: "reporter",
  },
  github: {
    keyPrefix: "#",
    myWorkQuery: "is:open is:issue assignee:@me",
    // GitHub Issues has only open/closed; interim states are labels (transition = add/remove label, done = close).
    states: { todo: "open", inProgress: "in progress", inReview: "in review", verify: "needs testing", verified: "verified", done: "closed" },
    handoff: "reporter",
  },
  linear: {
    keyPrefix: "",
    myWorkQuery: "assignee:me state:started",
    states: { todo: "Todo", inProgress: "In Progress", inReview: "In Review", verify: "In Review", verified: "Done", done: "Done" },
    handoff: "reporter",
  },
};

function defaultsFrom(d, prev) {
  const p = prev || {};
  const pm = d.packageManager;
  const it = p.issueTracker || {};
  const tool = it.tool || (d.vcs.host === "github" ? "github" : "none");
  const tp = TRACKER[tool] || {};
  return {
    version: 1,
    project: {
      name: (p.project && p.project.name) || (d.vcs.repo ? d.vcs.repo.split("/")[1] : path.basename(ROOT)),
      vcsHost: d.vcs.host,
      repo: d.vcs.repo,
      username: d.vcs.username || (p.project && p.project.username) || "",
    },
    issueTracker: {
      tool,
      connection: it.connection || (tool === "github" ? d.vcs.repo : ""),
      keyPrefix: it.keyPrefix || tp.keyPrefix || "",
      myWorkQuery: it.myWorkQuery || tp.myWorkQuery || "",
      issueTypes: it.issueTypes || { bug: "Bug", story: "Story" },
      states: it.states || tp.states || { todo: "To Do", inProgress: "In Progress", inReview: "In Review", verify: "", verified: "", done: "Done" },
      transitionIds: it.transitionIds || {},
      handoffAssignee: it.handoffAssignee || tp.handoff || "reporter",
    },
    vcs: {
      integrationBranch: (p.vcs && p.vcs.integrationBranch) || d.vcs.currentBranch || "main",
      envBranches: (p.vcs && p.vcs.envBranches) || {},
      fixBaseBranches: (p.vcs && p.vcs.fixBaseBranches) || {},
      branchNaming: (p.vcs && p.vcs.branchNaming) || "<type>/<KEY>",
      autoMerge: (p.vcs && p.vcs.autoMerge) || "squash",
      respectBranchProtection: true,
      prReview: (p.vcs && p.vcs.prReview) || { watchAuthors: [], reviewer: d.vcs.username || "" },
    },
    commands: (p.commands) || { packageManager: pm, install: pm + " install", typecheck: pm + " typecheck", lint: pm + " lint", format: pm + " format", build: pm + " build", test: pm + " test", commitConvention: "conventional-commits", commitNoAttribution: true },
    frontend: {
      frameworks: d.frontend.frameworks.length ? d.frontend.frameworks : ((p.frontend && p.frontend.frameworks) || []),
      apps: d.frontend.apps.length ? d.frontend.apps : ((p.frontend && p.frontend.apps) || []),
      styling: d.frontend.styling !== "none" ? d.frontend.styling : ((p.frontend && p.frontend.styling) || "none"),
      conventionsNote: (p.frontend && p.frontend.conventionsNote) || "",
    },
    backend: { ...d.backend, migrateCmd: (p.backend && p.backend.migrateCmd) || "" },
    edge: { ...d.edge, localRestart: (p.edge && p.edge.localRestart) || "" },
    testing: {
      unit: { runner: d.testing.unit, locations: (p.testing && p.testing.unit && p.testing.unit.locations) || [] },
      e2e: { runner: d.testing.e2e, dir: d.testing.e2eDir, command: (p.testing && p.testing.e2e && p.testing.e2e.command) || "", tagConvention: (p.testing && p.testing.e2e && p.testing.e2e.tagConvention) || "@<KEY>", bddStep: d.testing.bdd },
      testManagement: (p.testing && p.testing.testManagement) || "none",
    },
    memory: (p.memory) || { store: "none", collectionNaming: "", note: "" },
    ci: { host: (p.ci && p.ci.host) || d.ci.host, deployWorkflows: (p.ci && p.ci.deployWorkflows) || { default: d.ci.deployWorkflows }, deployPlatforms: (p.ci && p.ci.deployPlatforms) || [], deployGate: (p.ci && typeof p.ci.deployGate === "boolean") ? p.ci.deployGate : false, humanGatedEnvs: (p.ci && p.ci.humanGatedEnvs) || ["prod"] },
    design: (p.design) || { figma: false, note: "" },
    reporting: (p.reporting) || { daily: true, destination: "none" },
    compliance: (p.compliance) || "none",
    integrations: { superpowers: (p.integrations && typeof p.integrations.superpowers === "boolean") ? p.integrations.superpowers : d.integrations.superpowers },
    recoveryNotes: (p.recoveryNotes) || "",
  };
}

// ---------- prompting ----------
async function prompt(cfg, conflicts) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q, d) => new Promise((res) => rl.question(`${q}${d ? ` [${d}]` : ""}: `, (a) => res((a || "").trim() || d || "")));
  console.log("\n- Project stack onboarding - press Enter to accept the detected default -\n");
  for (const c of conflicts) {
    const a = await ask("Conflict " + c.path + ": observed " + JSON.stringify(c.observed) + " [" + c.source + "], config has " + JSON.stringify(c.current) + " - keep config (Enter) / take observed (o)", "");
    if (/^o/i.test(a)) { const parent = c.pathArr.slice(0, -1).reduce((n, k) => n[k], cfg); parent[c.pathArr[c.pathArr.length - 1]] = c.observed; }
  }
  cfg.project.name = await ask("Project name", cfg.project.name);
  cfg.project.username = await ask("Your VCS username (for 'my PRs'/'my work')", cfg.project.username);
  const prevTool = cfg.issueTracker.tool;
  cfg.issueTracker.tool = await ask("Issue tracker (github/jira/linear/none)", prevTool);
  const tool = cfg.issueTracker.tool;
  const tp = TRACKER[tool];
  // When the tracker changed (or a field is still empty), seed it with that tracker's idioms.
  if (tp) {
    const seed = (k, v) => { if (tool !== prevTool || !cfg.issueTracker[k] || (typeof cfg.issueTracker[k] === "object" && !Object.keys(cfg.issueTracker[k]).length)) cfg.issueTracker[k] = v; };
    seed("keyPrefix", tp.keyPrefix);
    seed("myWorkQuery", tp.myWorkQuery);
    seed("states", { ...tp.states });
    seed("handoffAssignee", tp.handoff);
    if (tool !== prevTool && tool === "github") cfg.issueTracker.transitionIds = {};
  }
  if (tool === "jira") {
    cfg.issueTracker.connection = await ask("  Jira cloud (e.g. yourco.atlassian.net)", cfg.issueTracker.connection);
    cfg.issueTracker.keyPrefix = await ask("  Ticket key prefix (e.g. PROJ)", cfg.issueTracker.keyPrefix);
    cfg.issueTracker.myWorkQuery = await ask("  'My active work' JQL", cfg.issueTracker.myWorkQuery);
    cfg.issueTracker.handoffAssignee = await ask("  On verify, reassign to (reporter/none)", cfg.issueTracker.handoffAssignee);
  } else if (tool === "github") {
    cfg.issueTracker.connection = await ask("  GitHub repo that holds the issues (owner/name)", cfg.issueTracker.connection || cfg.project.repo);
    cfg.issueTracker.myWorkQuery = await ask("  'My active work' issue search", cfg.issueTracker.myWorkQuery);
    cfg.issueTracker.handoffAssignee = await ask("  On verify, reassign to (reporter=issue author / none)", cfg.issueTracker.handoffAssignee);
    console.log("    GitHub Issues: interim states are labels (todo=open, done=closed) — transition = add/remove label + close; no transition ids.");
  } else if (tool === "linear") {
    cfg.issueTracker.connection = await ask("  Linear team key (e.g. ENG)", cfg.issueTracker.connection);
    cfg.issueTracker.myWorkQuery = await ask("  'My active work' filter", cfg.issueTracker.myWorkQuery);
    cfg.issueTracker.handoffAssignee = await ask("  On verify, reassign to (reporter=creator / none)", cfg.issueTracker.handoffAssignee);
  } else if (tool !== "none") {
    cfg.issueTracker.myWorkQuery = await ask("  'My active work' query", cfg.issueTracker.myWorkQuery);
  }
  cfg.vcs.integrationBranch = await ask("Integration branch", cfg.vcs.integrationBranch);
  cfg.commands.packageManager = await ask("Package manager", cfg.commands.packageManager);
  cfg.frontend.frameworks = (await ask("Frontend framework(s), comma-sep", cfg.frontend.frameworks.join(","))).split(",").map((s) => s.trim()).filter(Boolean);
  cfg.frontend.styling = await ask("Styling system", cfg.frontend.styling);
  cfg.backend.platform = await ask("Backend/DB platform (supabase/prisma/postgres/none)", cfg.backend.platform);
  cfg.edge.platform = await ask("Serverless/edge platform (supabase-edge-deno/lambda/netlify/none)", cfg.edge.platform);
  cfg.testing.unit.runner = await ask("Unit test runner", cfg.testing.unit.runner);
  cfg.testing.e2e.runner = await ask("E2E runner (playwright/cypress/none)", cfg.testing.e2e.runner);
  if (cfg.testing.e2e.runner !== "none") cfg.testing.e2e.tagConvention = await ask("  E2E tag convention", cfg.testing.e2e.tagConvention);
  cfg.testing.testManagement = await ask("Test-management sync (zephyr/testrail/none)", cfg.testing.testManagement);
  cfg.memory.store = await ask("Vector-memory store (qdrant/none)", cfg.memory.store);
  cfg.design.figma = /^(y|yes|true)$/i.test(await ask("Use Figma for designs? (y/n)", cfg.design.figma ? "y" : "n"));
  cfg.reporting.destination = await ask("Daily-report destination (none = push notification only; or a channel/page/issue)", cfg.reporting.destination || "none");
  cfg.compliance = await ask("Data-protection regime (none/HIPAA/GDPR/PCI/...)", cfg.compliance || "none");
  cfg.commands.commitNoAttribution = /^(y|yes|true)$/i.test(await ask("Forbid AI-attribution lines in commit messages? (y/n)", cfg.commands.commitNoAttribution ? "y" : "n"));
  rl.close();
  return cfg;
}

// ---------- rendering ----------
// Built with a backtick helper (bt) so the source contains no escaped backticks.
function renderMd(c) {
  const yn = (b) => (b ? "yes" : "no");
  const list = (a) => (a && a.length ? a.join(", ") : DASH);
  const bt = String.fromCharCode(96);
  const v = (x) => (x === 0 || x ? x : DASH);
  const code = (x) => bt + v(x) + bt;
  const states = Object.entries(c.issueTracker.states).map(([k, s]) => k + "=" + (s || DASH)).join(", ");
  const transitions = Object.keys(c.issueTracker.transitionIds).length ? JSON.stringify(c.issueTracker.transitionIds) : DASH;
  const envB = Object.keys(c.vcs.envBranches).length ? JSON.stringify(c.vcs.envBranches) : DASH;
  const fixB = Object.keys(c.vcs.fixBaseBranches).length ? JSON.stringify(c.vcs.fixBaseBranches) : DASH;
  const L = [];
  L.push("# Project stack - " + code(c.project.name));
  L.push("");
  L.push("> Source of truth for the loop-stack skills/agents/commands/loops. Generated by " + code("onboarding") + ".");
  L.push("> Edit freely, or re-run onboarding. " + code("none") + "/empty for a section means \"this project doesn't use it - skip those steps.\"");
  L.push("");
  L.push("## Project");
  L.push("- VCS host: **" + v(c.project.vcsHost) + "**");
  L.push("- Repo: **" + v(c.project.repo) + "**");
  L.push("- Your username: **" + v(c.project.username) + "**");
  L.push("");
  L.push("## Issue tracker");
  L.push("- Tool: **" + v(c.issueTracker.tool) + "**");
  L.push("- Connection: " + v(c.issueTracker.connection));
  L.push("- Ticket key prefix: " + (c.issueTracker.keyPrefix || DASH + " (e.g. GitHub #number)"));
  L.push("- \"My active work\" query: " + code(c.issueTracker.myWorkQuery));
  L.push("- Issue types: bug=" + code(c.issueTracker.issueTypes.bug) + ", story=" + code(c.issueTracker.issueTypes.story));
  L.push("- States: " + states);
  L.push("- Transition ids (if tracker needs them): " + transitions);
  L.push("- On verify, reassign to: " + v(c.issueTracker.handoffAssignee) + " (reporter = the issue opener, whatever the tracker calls it)");
  if (c.issueTracker.tool === "github") L.push("- GitHub Issues: interim states are labels (todo=open, done=closed); transition = add/remove the state label (+ close for done); no transition ids; reporter handoff = issue author.");
  else if (c.issueTracker.tool === "linear") L.push("- Linear: transition by workflow state name; reporter handoff = issue creator.");
  L.push("");
  L.push("## Branching / PR model");
  L.push("- Integration branch: **" + v(c.vcs.integrationBranch) + "**");
  L.push("- Env -> branch: " + envB);
  L.push("- Fix base branches: " + fixB);
  L.push("- Branch naming: " + code(c.vcs.branchNaming));
  L.push("- Auto-merge: " + v(c.vcs.autoMerge) + " | respect branch protection: **always**");
  L.push("- PR-review scope: reviewer=" + code(c.vcs.prReview.reviewer) + ", watch authors=" + list(c.vcs.prReview.watchAuthors));
  L.push("");
  L.push("## Commands");
  L.push("- Package manager: **" + v(c.commands.packageManager) + "** | install: " + code(c.commands.install));
  L.push("- typecheck: " + code(c.commands.typecheck) + " | lint: " + code(c.commands.lint) + " | format: " + code(c.commands.format) + " | build: " + code(c.commands.build) + " | test: " + code(c.commands.test));
  L.push("- Commit convention: " + v(c.commands.commitConvention) + " | forbid AI-attribution in commits: " + yn(c.commands.commitNoAttribution));
  L.push("");
  L.push("## Frontend");
  L.push("- Frameworks: " + list(c.frontend.frameworks));
  L.push("- Apps/packages: " + list(c.frontend.apps));
  L.push("- Styling: " + v(c.frontend.styling));
  L.push("- Conventions: " + v(c.frontend.conventionsNote));
  L.push("");
  L.push("## Backend / database");
  L.push("- Platform: **" + v(c.backend.platform) + "** | migrations dir: " + v(c.backend.migrationsDir) + " | migrate cmd: " + v(c.backend.migrateCmd));
  L.push("");
  L.push("## Serverless / edge");
  L.push("- Platform: **" + v(c.edge.platform) + "** | functions dir: " + v(c.edge.functionsDir) + " | local restart: " + v(c.edge.localRestart));
  L.push("");
  L.push("## Testing");
  L.push("- Unit: **" + v(c.testing.unit.runner) + "** | locations: " + list(c.testing.unit.locations));
  L.push("- E2E: **" + v(c.testing.e2e.runner) + "** | dir: " + v(c.testing.e2e.dir) + " | tag: " + code(c.testing.e2e.tagConvention) + " | bdd: " + v(c.testing.e2e.bddStep));
  L.push("- Test-management sync: " + v(c.testing.testManagement));
  L.push("- Green gate: **all unit tests green + all E2E green after every implementation** " + DASH + " full suites (no `--filter`, no `--grep`), run after the final edit, reported with the verbatim command + raw output. See `skills/shared/green-gate.md`.");
  {
    const noUnitRunner = !c.testing.unit.runner || c.testing.unit.runner === "none";
    const noE2ERunner = !c.testing.e2e.runner || c.testing.e2e.runner === "none";
    if (noUnitRunner || noE2ERunner) {
      const missing = noUnitRunner && noE2ERunner ? "unit or E2E" : noUnitRunner ? "unit" : "E2E";
      L.push("- **No " + missing + " harness detected** " + DASH + " testing is the one capability where `none` is NOT a silent skip. Offer the `scaffold-test-projects` skill (Gherkin `.feature` files, page objects, typed web-element wrappers, hooks), then re-run `onboard` to record the new runners.");
    }
  }
  L.push("");
  L.push("## Vector memory / knowledge store");
  L.push("- Store: **" + v(c.memory.store) + "** | collections: " + v(c.memory.collectionNaming) + " | " + (c.memory.note || ""));
  L.push("");
  L.push("## CI / deploy");
  L.push("- CI host: **" + v(c.ci.host) + "**");
  L.push("- Deploy workflows: " + JSON.stringify(c.ci.deployWorkflows));
  L.push("- Deploy platforms: " + list(c.ci.deployPlatforms));
  L.push("- Deploy gate before verify: " + yn(c.ci.deployGate) + " | human-gated envs: " + list(c.ci.humanGatedEnvs));
  L.push("");
  L.push("## Design");
  L.push("- Figma: " + yn(c.design.figma) + (c.design.note ? " | " + c.design.note : ""));
  L.push("");
  L.push("## Reporting");
  L.push("- Daily report: " + yn(c.reporting.daily) + " | destination: **" + v(c.reporting.destination) + "** (none = push notification only)");
  L.push("");
  L.push("## Compliance / data protection");
  L.push("- Regime: **" + (c.compliance || "none") + "** (reviewers apply data-protection/sensitive-data checks only when this is not \"none\"; e.g. HIPAA, GDPR, PCI)");
  L.push("");
  L.push("## Integrations");
  L.push("- Superpowers plugin: **" + yn(c.integrations.superpowers) + "** (when yes, skills prefer the superpowers process skills - TDD, systematic-debugging, verification-before-completion, requesting/receiving-code-review, dispatching-parallel-agents, finishing-a-development-branch - and fall back to the built-in checkpoints when no; see skills/shared/superpowers-integration.md)");
  L.push("");
  L.push("## Project recovery / runbook notes");
  L.push(c.recoveryNotes || "_(none - add project-specific recovery steps here; skills reference this section instead of baking them in.)_");
  L.push("");
  return L.join("\n");
}

// ---------- main ----------
const detected = detect();
const observed = observe(detected);

if (DETECT_ONLY) {
  console.log(JSON.stringify(detected, null, 2));
  console.log("\n" + renderObservedReport(observed));
  process.exit(0);
}

const prev = readJSON(path.resolve(OUT, "stack.json"));
let cfg = defaultsFrom(detected, prev);
const { filled, conflicts } = mergeObserved(cfg, observed, prev);
for (const f of filled) console.log("  observed " + f.path + " = " + JSON.stringify(f.value) + " [" + f.source + "]");
if (!NON_INTERACTIVE) cfg = await prompt(cfg, conflicts);
else for (const c of conflicts) console.log("  ! " + c.path + ": config keeps " + JSON.stringify(c.current) + " (observed " + JSON.stringify(c.observed) + " [" + c.source + "])");
delete cfg._observed;
cfg._observed = { at: new Date().toISOString(), ...observed };

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.resolve(OUT, "stack.json"), JSON.stringify(cfg, null, 2) + "\n");
fs.writeFileSync(path.resolve(OUT, "stack.md"), renderMd(cfg));

// Per-project loop state (park/dedupe files). Lives inside the project so parallel projects
// never share state (global /tmp would collide issue keys, PR numbers, and deploy run IDs
// across repos — and gets wiped on reboot). Gitignored: state is machine-local, not shared.
const stateDir = path.resolve(OUT, "loops", "state");
fs.mkdirSync(stateDir, { recursive: true });
const gitignorePath = path.resolve(ROOT, ".gitignore");
const stateIgnore = ".claude/loops/state/";
const gi = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, "utf8") : "";
if (!gi.split("\n").some((l) => l.trim() === stateIgnore || l.trim() === stateIgnore.slice(0, -1))) {
  fs.writeFileSync(gitignorePath, gi + (gi && !gi.endsWith("\n") ? "\n" : "") + stateIgnore + "\n");
  console.log("  Added " + stateIgnore + " to .gitignore (per-project loop state).");
}

// Materialize the loop specs into the project. Cron prompts reference .claude/loops/<spec>.md,
// which must exist in the project regardless of how the stack is installed (plugin cache or
// repo copy). Never overwrite: once copied, the project owns its specs ("you own this file").
const specSrcDir = path.resolve(SCRIPT_DIR, "..", "..", "loops");
try {
  for (const f of fs.readdirSync(specSrcDir).filter((n) => n.endsWith(".md"))) {
    const dst = path.resolve(OUT, "loops", f);
    if (!fs.existsSync(dst)) {
      fs.copyFileSync(path.resolve(specSrcDir, f), dst);
      console.log("  Materialized loop spec " + path.relative(ROOT, dst) + ".");
    }
  }
} catch {
  console.log("  Note: could not find the stack's loops/ dir — copy loops/*.md into .claude/loops/ yourself.");
}

console.log("\nWrote " + path.relative(ROOT, path.resolve(OUT, "stack.json")) + " and " + path.relative(ROOT, path.resolve(OUT, "stack.md")));
console.log("  The loop-stack skills now read this instead of asking project-specific questions.");
console.log("  Review .claude/stack.md and tweak anything (especially issue-tracker states/transitions).");

// Drop the universal, config-driven CLAUDE.md at the project root if one isn't there yet.
// It is project-agnostic (reads .claude/stack.md), so we never clobber an existing file.
const claudeMdPath = path.resolve(ROOT, "CLAUDE.md");
if (!fs.existsSync(claudeMdPath)) {
  const tplPath = path.resolve(SCRIPT_DIR, "CLAUDE.template.md");
  try {
    fs.copyFileSync(tplPath, claudeMdPath);
    console.log("  Wrote " + path.relative(ROOT, claudeMdPath) + " (universal entry point; reads .claude/stack.md).");
  } catch {
    console.log("  Note: copy skills/onboard/CLAUDE.template.md to ./CLAUDE.md for the universal entry point.");
  }
} else {
  console.log("  CLAUDE.md already exists — left untouched. See skills/onboard/CLAUDE.template.md for the universal version.");
}

// No test harness detected -> point at the scaffolder (Playwright + Gherkin E2E, unit project).
const noE2E = !cfg.testing.e2e.runner || cfg.testing.e2e.runner === "none";
const noUnit = !cfg.testing.unit.runner || cfg.testing.unit.runner === "none";
if (noE2E || noUnit) {
  const which = noE2E && noUnit ? "no E2E or unit test project" : noE2E ? "no E2E project" : "no unit-test project";
  console.log("  " + which + " detected -> run the 'scaffold-test-projects' skill to bootstrap a Gherkin-driven Playwright E2E project + unit tests (page objects, web-element wrappers, hooks), then re-run onboard.");
  console.log("  Until then every implementation must SAY so: the green gate (all units green + all e2e green) reports 'suggested-scaffold', never a silent skip. See skills/shared/green-gate.md.");
}
