// Repo-level invariants. This is a plugin marketplace, so the manifests *are* the
// product: a version that drifts between plugin.json and marketplace.json ships a
// plugin nobody can install at the advertised version. These replace the hand-run
// checks in .github/workflows/validate.yml with assertions that say why they exist.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { REPO_ROOT } from "./helpers/fixtures.mjs";

const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), "utf8"));
const marketplace = readJSON(".claude-plugin/marketplace.json");

/** Every tracked file, via git so untracked scratch files never fail the suite. */
const trackedFiles = execFileSync("git", ["ls-files"], { cwd: REPO_ROOT, encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const scripts = trackedFiles.filter((f) => f.endsWith(".mjs"));

describe("plugin manifests", () => {
  test("marketplace.json declares at least one plugin and parses", () => {
    assert.ok(Array.isArray(marketplace.plugins));
    assert.ok(marketplace.plugins.length > 0);
    assert.match(marketplace.version, /^\d+\.\d+\.\d+$/);
  });

  for (const entry of marketplace.plugins) {
    describe(`plugin: ${entry.name}`, () => {
      const manifestRel = path.join(entry.source, ".claude-plugin/plugin.json");

      test("its source directory ships a plugin.json", () => {
        assert.ok(fs.existsSync(path.join(REPO_ROOT, entry.source)), `${entry.source} is missing`);
        assert.ok(fs.existsSync(path.join(REPO_ROOT, manifestRel)), `${manifestRel} is missing`);
      });

      test("version matches the marketplace entry", () => {
        const manifest = readJSON(manifestRel);
        assert.equal(
          manifest.version,
          entry.version,
          `${entry.name}: plugin.json says ${manifest.version}, marketplace.json says ${entry.version} — bump both`,
        );
      });

      test("name matches the marketplace entry", () => {
        assert.equal(readJSON(manifestRel).name, entry.name);
      });
    });
  }
});

describe("scripts", () => {
  test("every tracked .mjs parses", () => {
    const failures = [];
    for (const rel of scripts) {
      try {
        execFileSync(process.execPath, ["--check", path.join(REPO_ROOT, rel)], { stdio: "pipe" });
      } catch (err) {
        failures.push(`${rel}: ${String(err.stderr || err.message).split("\n")[0]}`);
      }
    }
    assert.deepEqual(failures, []);
  });

  // A raw NUL byte in a source file is invisible in review but makes grep/ripgrep
  // treat the file as binary and skip its contents — in a repo whose whole workflow
  // is searching skill and script files, that silently hides code. Write the
  // escape sequence in source instead; the runtime value is identical.
  test("no tracked text file carries a raw NUL byte", () => {
    const textLike = /\.(mjs|js|ts|json|md|ya?ml|txt)$/;
    const offenders = trackedFiles
      .filter((f) => textLike.test(f))
      .filter((f) => fs.readFileSync(path.join(REPO_ROOT, f)).includes(0));

    assert.deepEqual(offenders, [], "escape control characters instead of embedding them");
  });
});

describe("loop-stack shared contracts", () => {
  const sharedDir = "plugins/loop-stack/skills/shared";

  test("the files other skills are told to read exist", () => {
    for (const f of ["green-gate.md", "definition-of-done.md", "finish-line.md", "superpowers-integration.md"]) {
      assert.ok(fs.existsSync(path.join(REPO_ROOT, sharedDir, f)), `${sharedDir}/${f} is referenced but missing`);
    }
  });

  // The green gate is a single source of truth: skills reference it. A reference to a
  // shared file that doesn't exist is a dead instruction the model silently skips.
  test("every referenced skills/shared/*.md target exists", () => {
    const refRe = /skills\/shared\/([a-z0-9-]+\.md)/g;
    const missing = new Set();

    for (const rel of trackedFiles.filter((f) => f.endsWith(".md") || f.endsWith(".mjs"))) {
      const body = fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
      for (const [, target] of body.matchAll(refRe)) {
        if (!fs.existsSync(path.join(REPO_ROOT, sharedDir, target))) missing.add(`${rel} -> ${target}`);
      }
    }

    assert.deepEqual([...missing], []);
  });
});
