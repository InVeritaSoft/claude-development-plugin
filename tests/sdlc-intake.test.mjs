// The SDLC intake pipeline (commands/sdlc.md) harvests a whole tracker + docs space into a
// corpus on disk, then turns it into Requirements → Designs → PRD → a Task Master task tree.
// Two classes of thing can break silently here:
//
//   1. Config the pipeline reads (docs.*, knowledge.*, integrations.taskMaster) not being
//      written by onboard — every agent would then read an undefined token and improvise.
//   2. The corpus not being gitignored — it holds harvested issues and pages verbatim, which
//      in this working environment can include sensitive material. That must never be
//      committable, and "we added it to .gitignore" is exactly the kind of claim that rots.
//
// The prose contracts themselves (agents/*.md, commands/sdlc.md) are instructions, not code;
// what is asserted here is that the files exist and that the blocking prerequisites are stated,
// since the whole design turns on those three being hard stops rather than soft skips.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ONBOARD, REPO_ROOT, tmpProject, cleanupTmpProjects, runScript, read, readJSON, stackMdSection } from "./helpers/fixtures.mjs";

after(cleanupTmpProjects);

const pkg = (deps = {}) => ({ name: "fixture", version: "1.0.0", devDependencies: deps });
const LOOP_STACK = path.join(REPO_ROOT, "plugins/loop-stack");
const readPlugin = (rel) => fs.readFileSync(path.join(LOOP_STACK, rel), "utf8");

describe("onboard writes the SDLC intake config", () => {
  test("stack.json carries docs, knowledge, and task-master keys", () => {
    const dir = tmpProject({ "package.json": pkg() });
    const { status } = runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });

    assert.equal(status, 0);
    const cfg = readJSON(dir, ".claude/stack.json");

    assert.equal(cfg.docs.platform, "none", "docs platform defaults to none (both docs agents no-op)");
    assert.deepEqual(cfg.docs.spaces, []);
    assert.ok("connection" in cfg.docs);
    assert.ok("graph" in cfg.knowledge && "vault" in cfg.knowledge);
    assert.ok(["mcp", "cli", "none"].includes(cfg.integrations.taskMaster));
  });

  test("stack.md renders the docs + knowledge-layer sections the agents read", () => {
    const dir = tmpProject({ "package.json": pkg() });
    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });
    const md = read(dir, ".claude/stack.md");

    assert.match(stackMdSection(md, "## Docs / knowledge base"), /Platform: \*\*none\*\*/);
    assert.match(stackMdSection(md, "## Knowledge layers (SDLC intake)"), /Obsidian vault mirror/);
    // pgvector is a co-equal store with qdrant; a stack.md that only names qdrant sends every
    // Postgres project to install a second database it does not need.
    assert.match(stackMdSection(md, "## Vector memory / knowledge store"), /pgvector/);
    assert.match(stackMdSection(md, "## Integrations"), /Task Master/);
  });

  test("detects Task Master from a project .mcp.json", () => {
    const dir = tmpProject({
      "package.json": pkg(),
      ".mcp.json": { mcpServers: { "task-master-ai": { command: "node", args: ["dist/index.js"] } } },
    });
    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });

    assert.equal(readJSON(dir, ".claude/stack.json").integrations.taskMaster, "mcp");
  });
});

describe("the harvest corpus is never committable", () => {
  test("onboard gitignores .claude/sdlc/ alongside the loop state dir", () => {
    const dir = tmpProject({ "package.json": pkg() });
    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });

    const lines = read(dir, ".gitignore").split("\n").map((l) => l.trim());
    assert.ok(lines.includes(".claude/sdlc/"), "the harvested corpus must be gitignored");
    assert.ok(lines.includes(".claude/loops/state/"), "the existing loop-state ignore must survive");
  });

  test("an existing .gitignore is appended to, never clobbered", () => {
    const dir = tmpProject({ "package.json": pkg(), ".gitignore": "node_modules\n.env\n" });
    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });

    const gi = read(dir, ".gitignore");
    assert.match(gi, /^node_modules$/m, "pre-existing rules must survive onboarding");
    assert.match(gi, /^\.env$/m);
    assert.match(gi, /^\.claude\/sdlc\/$/m);
  });

  test("re-running onboard does not duplicate the ignore rules", () => {
    const dir = tmpProject({ "package.json": pkg() });
    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });
    runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });

    const lines = read(dir, ".gitignore").split("\n").map((l) => l.trim()).filter(Boolean);
    assert.equal(lines.filter((l) => l === ".claude/sdlc/").length, 1);
    assert.equal(lines.filter((l) => l === ".claude/loops/state/").length, 1);
  });
});

describe("pipeline files and their degradation contracts", () => {
  const files = [
    "commands/sdlc.md",
    "agents/issue-sweeper.md",
    "agents/docs-sweeper.md",
    "agents/docs-harvester.md",
    "agents/issue-harvester.md",
    "skills/shared/task-master-preflight.md",
    "skills/shared/corpus-index.md",
  ];

  for (const rel of files) {
    test(`${rel} exists`, () => {
      assert.ok(fs.existsSync(path.join(LOOP_STACK, rel)), `${rel} is referenced by the pipeline but missing`);
    });
  }

  // A missing tool must never stop the user — but it must also never pass silently. Both
  // contracts have to say the same two things: keep going, and mark the run incomplete. If an
  // edit drops the second half, the pipeline ships a prose plan from a sampled corpus and it
  // looks exactly like success.
  test("task-master-preflight warns and continues rather than blocking", () => {
    const body = readPlugin("skills/shared/task-master-preflight.md");
    assert.match(body, /never blocks/i);
    assert.match(body, /incomplete/i, "the run outcome must be marked, not just mentioned");
    assert.match(body, /Lolibai\/claude-task-master/, "the fork is the supported path and must be named");
    assert.match(body, /subscription/i, "why the fork matters: no metered API key");
  });

  test("corpus-index degrades instead of blocking above the size threshold", () => {
    const body = readPlugin("skills/shared/corpus-index.md");
    assert.match(body, /never a blocker/i);
    assert.match(body, /degraded/i);
    assert.match(body, /incomplete/i);
    assert.match(body, /qdrant/i);
    assert.match(body, /pgvector/i);
    assert.match(body, /300/, "the threshold above which a missing store costs coverage");
  });

  test("the pipeline command carries a run outcome instead of stopping", () => {
    const body = readPlugin("commands/sdlc.md");
    assert.match(body, /never stops because a tool is absent/i);
    assert.match(body, /outcome: complete \| incomplete/);
    assert.match(body, /resume_from/, "a degraded run must say where a re-run picks up");
  });

  test("the sweepers shard to disk instead of returning the corpus inline", () => {
    for (const rel of ["agents/issue-sweeper.md", "agents/docs-sweeper.md"]) {
      const body = readPlugin(rel);
      assert.match(body, /\.claude\/sdlc\/corpus\//, `${rel} must write to the project corpus`);
      assert.match(body, /resume|cursor/i, `${rel} must checkpoint so a large sweep survives interruption`);
      assert.match(body, /never return corpus contents inline/i, `${rel} must not return the corpus`);
    }
  });

  // A link-presence flag is not design coverage: a file-level link, a deleted node, or a design
  // last touched before the AC changed all read as "has a design" in a sweep and give whoever
  // implements the story nothing. The audit is what closes that accuracy gap, so it has to stay
  // wired into the places where UI work actually starts.
  test("design-link-audit checks usability, not just presence", () => {
    const body = readPlugin("skills/design-link-audit/SKILL.md");
    for (const finding of ["file_level_only", "unresolvable", "node_missing", "stale_pairing", "screenshot_only"]) {
      assert.match(body, new RegExp(finding), `the audit must classify ${finding}`);
    }
    assert.match(body, /designs_without_requirement|designs with no requirement/i, "coverage runs both ways");
    assert.match(body, /never invent a design/i);
    assert.match(body, /no-op/i, "it must skip cleanly when no design tool is configured");
  });

  test("the audit is wired into the flows where UI work starts", () => {
    for (const rel of ["commands/sdlc.md", "commands/implement.md", "skills/devfix/SKILL.md"]) {
      assert.match(readPlugin(rel), /design-link-audit/, `${rel} must invoke the audit`);
    }
  });

  test("the docs harvester keeps the whole-page rule", () => {
    // Same discipline implement-designs enforces for design nodes: a partial read is a
    // missing requirement, and it is invisible in the output.
    const body = readPlugin("agents/docs-harvester.md");
    assert.match(body, /whole page/i);
    assert.match(body, /never (a subset|an excerpt)|never a subset/i);
  });
});
