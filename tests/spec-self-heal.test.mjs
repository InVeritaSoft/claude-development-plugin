// Self-healing loop specs.
//
// onboard materializes loops/*.md into a project and used to never touch them again — the project
// owns its specs, because they accumulate real project lessons. The cost was that an upstream fix
// (the leaked issue key in daily-report.md, say) could never reach a project that had already
// onboarded: the bug outlived its own fix, indefinitely and silently.
//
// The fix refreshes a spec only when it hashes to some version this stack has shipped, which proves
// nobody edited it and makes the replacement lossless. The two properties that matter are therefore
// opposites, and both have to hold at once: an untouched stale file MUST be updated, and an edited
// file MUST NOT be — a single wrong call in either direction is either a bug that never dies or a
// user's notes silently deleted.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { ONBOARD, REPO_ROOT, tmpProject, cleanupTmpProjects, runScript, read } from "./helpers/fixtures.mjs";

after(cleanupTmpProjects);

const pkg = { name: "fixture", version: "1.0.0" };
const SPEC_DIR = path.join(REPO_ROOT, "plugins/loop-stack/loops");
const HASHES = path.join(SPEC_DIR, ".known-hashes.json");
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const onboarded = () => {
  const dir = tmpProject({ "package.json": pkg });
  runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });
  return dir;
};

describe("the known-version hash table", () => {
  test("exists, is committed, and covers every shipped spec", () => {
    assert.ok(fs.existsSync(HASHES), "run scripts/gen-spec-hashes.mjs");
    const { files } = JSON.parse(fs.readFileSync(HASHES, "utf8"));

    for (const spec of fs.readdirSync(SPEC_DIR).filter((f) => f.endsWith(".md"))) {
      assert.ok(Array.isArray(files[spec]) && files[spec].length, `${spec} has no recorded versions`);
      // The version being shipped right now must be in its own table, or a freshly onboarded
      // project would immediately look "customized" to the next run.
      const current = sha(fs.readFileSync(path.join(SPEC_DIR, spec)));
      assert.ok(files[spec].includes(current), `${spec}: the current shipped version is not in the table — regenerate`);
    }
  });

  // Byte-stable output is what lets the release gate diff it. If regeneration embedded a
  // timestamp, the gate would fire on every run and everyone would learn to bypass it.
  test("regenerating is byte-stable and the checked-in table is current", () => {
    const before = fs.readFileSync(HASHES, "utf8");
    execFileSync(process.execPath, [path.join(REPO_ROOT, "scripts/gen-spec-hashes.mjs")], { cwd: REPO_ROOT, stdio: "pipe" });
    const after = fs.readFileSync(HASHES, "utf8");

    assert.equal(after, before, "the table drifted from the specs — run scripts/gen-spec-hashes.mjs and commit the result");
  });
});

describe("onboard refreshes unmodified specs", () => {
  test("a spec matching an older shipped version is updated in place", () => {
    const dir = onboarded();
    const spec = path.join(dir, ".claude/loops/daily-report.md");
    const { files } = JSON.parse(fs.readFileSync(HASHES, "utf8"));
    const current = sha(fs.readFileSync(path.join(SPEC_DIR, "daily-report.md")));
    const older = files["daily-report.md"].find((h) => h !== current);
    assert.ok(older, "need at least two shipped versions of daily-report.md to test the refresh");

    // Reconstruct that older version from history and plant it, exactly as a project onboarded
    // on an earlier release would have it.
    const commits = execFileSync("git", ["log", "--follow", "--format=%H", "--", "plugins/loop-stack/loops/daily-report.md"], {
      cwd: REPO_ROOT, encoding: "utf8",
    }).split("\n").filter(Boolean);
    let planted = null;
    for (const c of commits) {
      let blob;
      try { blob = execFileSync("git", ["show", `${c}:plugins/loop-stack/loops/daily-report.md`], { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "ignore"] }); } catch { continue; }
      if (sha(blob) === older) { planted = blob; break; }
    }
    assert.ok(planted, "could not reconstruct an older shipped version");
    fs.writeFileSync(spec, planted);

    const { stdout } = runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });

    assert.match(stdout, /Refreshed 1 unmodified loop spec/);
    assert.equal(sha(fs.readFileSync(spec)), current, "the stale spec must now be the shipped version");
  });

  test("an edited spec is never overwritten, and is reported", () => {
    const dir = onboarded();
    const spec = path.join(dir, ".claude/loops/pr-review.md");
    fs.appendFileSync(spec, "\n> Our team also checks the migration plan on every PR.\n");
    const before = fs.readFileSync(spec, "utf8");

    const { stdout } = runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });

    assert.equal(read(dir, ".claude/loops/pr-review.md"), before, "a project's own edits must survive onboarding");
    assert.match(stdout, /Kept your edited loop spec/);
    assert.match(stdout, /pr-review\.md/);
    assert.match(stdout, /do NOT receive upstream fixes/, "the trade-off has to be stated, or it is a silent one");
  });

  test("an up-to-date project reports neither refresh nor drift", () => {
    const dir = onboarded();
    const { stdout } = runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });

    assert.doesNotMatch(stdout, /Refreshed/);
    assert.doesNotMatch(stdout, /Kept your edited/);
  });

  test("a missing hash table degrades to the old never-overwrite behaviour", () => {
    // The table ships with the plugin; if a partial install lacks it, the safe failure is to
    // touch nothing — never to guess that an unrecognized file is stale.
    const dir = onboarded();
    const spec = path.join(dir, ".claude/loops/daily-report.md");
    fs.writeFileSync(spec, "totally different content\n");

    const { status, stdout } = runScript(ONBOARD, { cwd: dir, args: ["--non-interactive"] });

    assert.equal(status, 0);
    assert.equal(read(dir, ".claude/loops/daily-report.md"), "totally different content\n");
    assert.match(stdout, /Kept your edited loop spec/);
  });
});
