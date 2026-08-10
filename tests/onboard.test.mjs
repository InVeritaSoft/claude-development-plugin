// onboard.mjs is the linchpin of loop-stack: it detects a project's stack and writes
// .claude/stack.{md,json}, the loop specs, the state dir, and CLAUDE.md. It has two
// properties the rest of the stack depends on and that are easy to break silently:
// it must stay dependency-free, and detection must fail soft (a missing CLI never
// crashes a run). These tests drive the real script against throwaway projects.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ONBOARD, tmpProject, cleanupTmpProjects, runScript, read, readJSON, exists, stackMdSection } from "./helpers/fixtures.mjs";

after(cleanupTmpProjects);

const pkg = (deps = {}) => ({ name: "fixture", version: "1.0.0", devDependencies: deps });
const WITH_TESTS = pkg({ vitest: "^1.0.0", "@playwright/test": "^1.40.0" });

describe("onboard --detect-only", () => {
  test("prints parseable detection JSON and writes nothing", () => {
    const dir = tmpProject({ "package.json": WITH_TESTS });
    const { status, stdout } = runScript(ONBOARD, { cwd: dir, args: ["--detect-only"] });

    assert.equal(status, 0);
    const firstObject = stdout.slice(0, stdout.indexOf("\n}") + 2);
    const detected = JSON.parse(firstObject);
    assert.equal(detected.testing.unit, "vitest");
    assert.equal(detected.testing.e2e, "playwright");

    assert.equal(exists(dir, ".claude"), false, "--detect-only must not write config");
    assert.equal(exists(dir, "CLAUDE.md"), false, "--detect-only must not drop CLAUDE.md");
    assert.equal(exists(dir, "AGENTS.md"), false, "--detect-only must not drop AGENTS.md");
  });
});

describe("onboard --non-interactive", () => {
  test("writes stack.json + stack.md recording the detected runners", () => {
    const dir = tmpProject({ "package.json": WITH_TESTS, "tests/ui-tests/": "" });
    const { status } = runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });

    assert.equal(status, 0);
    const cfg = readJSON(dir, ".claude/stack.json");
    assert.equal(cfg.testing.unit.runner, "vitest");
    assert.equal(cfg.testing.e2e.runner, "playwright");
    assert.equal(cfg.testing.e2e.dir, "tests/ui-tests");

    const testing = stackMdSection(read(dir, ".claude/stack.md"), "## Testing");
    assert.match(testing, /Unit: \*\*vitest\*\*/);
    assert.match(testing, /E2E: \*\*playwright\*\*/);
  });

  test("creates the gitignored per-project loop state dir, idempotently", () => {
    const dir = tmpProject({ "package.json": pkg(), ".gitignore": "node_modules\n" });

    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });
    assert.equal(exists(dir, ".claude/loops/state"), true);
    assert.match(read(dir, ".gitignore"), /^\.claude\/loops\/state\/$/m);

    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });
    const entries = read(dir, ".gitignore").split("\n").filter((l) => l.trim() === ".claude/loops/state/");
    assert.equal(entries.length, 1, "re-running onboard must not duplicate the .gitignore entry");
  });

  test("materializes loop specs without clobbering a project's edits", () => {
    const dir = tmpProject({ "package.json": pkg() });

    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });
    const specs = fs.readdirSync(path.join(dir, ".claude/loops")).filter((f) => f.endsWith(".md"));
    assert.ok(specs.length >= 6, `expected the loop roster to be copied, got ${specs.length}`);

    // "You own this file": a project may tune a spec, and re-onboarding must respect that.
    const owned = path.join(dir, ".claude/loops", specs[0]);
    fs.writeFileSync(owned, "# edited by the project\n");
    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });
    assert.equal(fs.readFileSync(owned, "utf8"), "# edited by the project\n");
  });

  test("drops CLAUDE.md when absent and leaves an existing one untouched", () => {
    const fresh = tmpProject({ "package.json": pkg() });
    runScript(ONBOARD, { cwd: fresh, args: ["--non-interactive"] });
    assert.match(read(fresh, "CLAUDE.md"), /Always-apply invariants/);

    const owned = tmpProject({ "package.json": pkg(), "CLAUDE.md": "# mine\n" });
    runScript(ONBOARD, { cwd: owned, args: ["--non-interactive"] });
    assert.equal(read(owned, "CLAUDE.md"), "# mine\n");
  });

  test("drops an AGENTS.md that points at CLAUDE.md rather than copying it", () => {
    const fresh = tmpProject({ "package.json": pkg() });
    runScript(ONBOARD, { cwd: fresh, args: ["--non-interactive"] });

    const agents = read(fresh, "AGENTS.md");
    assert.match(agents, /CLAUDE\.md/, "AGENTS.md must route agents to CLAUDE.md");
    // A pointer, not a second copy: duplicated instructions drift, and the stale copy still reads
    // as authoritative. If this ever fails, someone started copying the template into both files.
    assert.doesNotMatch(agents, /Always-apply invariants/);

    const owned = tmpProject({ "package.json": pkg(), "AGENTS.md": "# mine\n" });
    runScript(ONBOARD, { cwd: owned, args: ["--non-interactive"] });
    assert.equal(read(owned, "AGENTS.md"), "# mine\n");
  });

  test("re-running preserves values already in stack.json", () => {
    const dir = tmpProject({ "package.json": WITH_TESTS });
    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });

    const cfg = readJSON(dir, ".claude/stack.json");
    cfg.testing.e2e.tagConvention = "@CUSTOM-<n>";
    cfg.recoveryNotes = "restart the widget service before e2e";
    fs.writeFileSync(path.join(dir, ".claude/stack.json"), JSON.stringify(cfg, null, 2));

    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });
    const after = readJSON(dir, ".claude/stack.json");
    assert.equal(after.testing.e2e.tagConvention, "@CUSTOM-<n>");
    assert.equal(after.recoveryNotes, "restart the widget service before e2e");
  });
});

describe("onboard fail-soft detection", () => {
  test("survives a malformed package.json", () => {
    const dir = tmpProject({ "package.json": "{ not json" });
    const { status } = runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });

    assert.equal(status, 0, "a broken manifest must degrade detection, not crash the run");
    assert.equal(exists(dir, ".claude/stack.json"), true);
  });

  test("survives a bare directory with no manifest, no git remote, no CLIs", () => {
    const dir = tmpProject({});
    const { status } = runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"], env: { PATH: "" } });

    assert.equal(status, 0);
    assert.equal(readJSON(dir, ".claude/stack.json").testing.unit.runner, "none");
  });
});

// The green gate's one carve-out from the config contract: testing set to `none`
// is surfaced with the scaffold offer, never skipped silently. stack.md is what
// every skill reads, so the signal has to survive into the rendered config.
describe("onboard green-gate rendering", () => {
  test("always states the gate in the Testing section", () => {
    const dir = tmpProject({ "package.json": WITH_TESTS });
    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });

    const testing = stackMdSection(read(dir, ".claude/stack.md"), "## Testing");
    assert.match(testing, /all unit tests green \+ all E2E green after every implementation/);
    assert.match(testing, /green-gate\.md/);
  });

  test("warns about a missing harness and points at the scaffolder", () => {
    const dir = tmpProject({ "package.json": pkg() });
    const { all } = runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });

    const testing = stackMdSection(read(dir, ".claude/stack.md"), "## Testing");
    assert.match(testing, /No unit or E2E harness detected/);
    assert.match(testing, /NOT a silent skip/);
    assert.match(testing, /scaffold-test-projects/);
    assert.match(testing, /page objects/);

    assert.match(all, /scaffold-test-projects/);
    assert.match(all, /suggested-scaffold/);
  });

  test("omits the warning when both harnesses are present", () => {
    const dir = tmpProject({ "package.json": WITH_TESTS, "tests/ui-tests/": "" });
    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });

    const testing = stackMdSection(read(dir, ".claude/stack.md"), "## Testing");
    assert.doesNotMatch(testing, /harness detected/);
    assert.match(testing, /all unit tests green/, "the gate line itself is unconditional");
  });

  test("warns when only one of the two harnesses is missing", () => {
    const dir = tmpProject({ "package.json": pkg({ vitest: "^1.0.0" }) });
    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });

    const testing = stackMdSection(read(dir, ".claude/stack.md"), "## Testing");
    assert.match(testing, /No E2E harness detected/);
  });

  // The IMPLEMENT loop only picks up issue types the project opted into at onboarding.
  // The key must exist with a tracker-preset default, render into stack.md (what loops read),
  // survive re-runs, and support [] = "loop disabled" without being re-seeded.
  test("seeds issueTypes.implement from the tracker preset and renders it", () => {
    const dir = tmpProject({ "package.json": pkg() });
    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });

    const cfg = readJSON(dir, ".claude/stack.json");
    assert.deepEqual(cfg.issueTracker.issueTypes.implement, ["story", "task"]);

    const tracker = stackMdSection(read(dir, ".claude/stack.md"), "## Issue tracker");
    assert.match(tracker, /IMPLEMENT loop picks up:/);
    assert.match(tracker, /story/);
  });

  test("preserves customized issueTypes.implement across re-runs, including []", () => {
    const dir = tmpProject({ "package.json": pkg() });
    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });

    const cfg = readJSON(dir, ".claude/stack.json");
    cfg.issueTracker.issueTypes.implement = ["Improvement"];
    fs.writeFileSync(path.join(dir, ".claude/stack.json"), JSON.stringify(cfg, null, 2));
    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });
    assert.deepEqual(readJSON(dir, ".claude/stack.json").issueTracker.issueTypes.implement, ["Improvement"]);

    cfg.issueTracker.issueTypes.implement = [];
    fs.writeFileSync(path.join(dir, ".claude/stack.json"), JSON.stringify(cfg, null, 2));
    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });
    assert.deepEqual(readJSON(dir, ".claude/stack.json").issueTracker.issueTypes.implement, [],
      "[] means 'IMPLEMENT loop disabled' and must not be re-seeded");
    assert.match(stackMdSection(read(dir, ".claude/stack.md"), "## Issue tracker"),
      /IMPLEMENT loop picks up: none/);
  });
});
