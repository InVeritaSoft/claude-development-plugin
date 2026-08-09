// The frozen-work-list failure, guarded.
//
// An autonomous loop is supposed to ask the tracker what to work on every tick. If a generated
// per-project file — or worse, a cron's prompt text — contains the ANSWER instead (the issue keys
// that were open when onboarding ran), the loop ticks on schedule, reports work, processes that
// frozen set forever, and never picks up anything new. Nothing errors. Nothing warns. The only
// symptom is that new tickets are silently never started, which costs about a day of confusion
// before anyone thinks to read the cron prompt.
//
// This suite covers the two halves of the fix: the shipped files must not carry a real key that
// would be copied into every project, and onboard must warn when a generated file has one.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ONBOARD, REPO_ROOT, tmpProject, cleanupTmpProjects, runScript, read } from "./helpers/fixtures.mjs";

after(cleanupTmpProjects);

const KEY_RE = /\b[A-Z][A-Z0-9]{1,9}-[0-9]{1,5}\b/g;

// Placeholders and structural names, not work items: <KEY> stand-ins, checkpoint labels, and the
// documented example prefixes used throughout CONVENTIONS.md.
const PLACEHOLDER = /^(CHECKPOINT|DC|PR|KEY|PROJ|ENG|TEAM|ABC|RESC)-/;

const trackedLoopStack = execFileSync("git", ["ls-files", "plugins/loop-stack"], { cwd: REPO_ROOT, encoding: "utf8" })
  .split("\n")
  .filter((f) => f.endsWith(".md"));

describe("shipped loop-stack files carry no real work items", () => {
  // loops/*.md are copied verbatim into every project that onboards. A real key in one of them is
  // a key in everyone's project — the exact leak that shipped as `RESC-1234` in daily-report.md.
  test("no materialized loop spec names a concrete issue key", () => {
    const offenders = [];
    for (const rel of trackedLoopStack.filter((f) => f.includes("/loops/"))) {
      const body = fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
      for (const hit of new Set(body.match(KEY_RE) || [])) {
        if (!PLACEHOLDER.test(hit)) offenders.push(`${rel}: ${hit}`);
      }
    }
    assert.deepEqual(offenders, [], "use <KEY> or ${issueTracker.keyPrefix}-<n>, never a live key");
  });

  test("the cron-prompt rule is stated where cron prompts are composed", () => {
    const body = fs.readFileSync(path.join(REPO_ROOT, "plugins/loop-stack/skills/launch-loop-stack/SKILL.md"), "utf8");
    assert.match(body, /never resolve .*myWorkQuery|carries the QUERY, never its RESULT/i);
    assert.match(body, /no-hardcoded-instructions\.md/);
  });

  test("the contract itself explains the silent-failure mode", () => {
    const body = fs.readFileSync(path.join(REPO_ROOT, "plugins/loop-stack/skills/shared/no-hardcoded-instructions.md"), "utf8");
    assert.match(body, /query.*never.*result/i);
    // The reason this rule is worth a file: the failure produces no error at all.
    assert.match(body, /silen|nothing errors/i);
    assert.match(body, /cron prompt/i);
  });
});

describe("onboard's frozen-work guard", () => {
  const pkg = { name: "fixture", version: "1.0.0" };

  test("warns when a generated loop spec names keys matching the project's prefix", () => {
    const dir = tmpProject({ "package.json": pkg });
    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });

    // Simulate the failure: a loop spec that carries the answer instead of the query.
    const spec = path.join(dir, ".claude/loops/daily-report.md");
    fs.appendFileSync(spec, "\nWork on ACME-141, ACME-152, ACME-158, ACME-160.\n");
    const cfgPath = path.join(dir, ".claude/stack.json");
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    cfg.issueTracker.keyPrefix = "ACME";
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

    const { stdout } = runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });

    assert.match(stdout, /frozen work list/i, "the guard must warn");
    assert.match(stdout, /ACME-141/, "it must name the offending key");
    assert.match(stdout, /matches this project's key prefix/, "a prefix match is a certain hit, not a maybe");
    assert.match(stdout, /no-hardcoded-instructions\.md/, "and point at the contract");
  });

  test("stays quiet on a clean project", () => {
    const dir = tmpProject({ "package.json": pkg });
    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });
    const { stdout } = runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });

    assert.doesNotMatch(stdout, /frozen work list/i, "a false positive here trains people to ignore the warning");
  });

  test("the guard never fails the run", () => {
    const dir = tmpProject({ "package.json": pkg });
    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });
    fs.appendFileSync(path.join(dir, ".claude/loops/daily-report.md"), "\nSee ACME-999.\n");

    const { status } = runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });
    assert.equal(status, 0, "it warns; onboarding still completes");
    assert.ok(read(dir, ".claude/stack.md").length > 0);
  });
});
