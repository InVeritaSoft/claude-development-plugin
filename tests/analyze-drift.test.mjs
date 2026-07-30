// analyze-drift.mjs turns computed styles into a token scale and flags outliers.
// It is a script, not a module, so it's driven here the way the pipeline drives it:
// a design-audit/computed-tokens.json fixture in cwd, assertions on what it emits.
//
// The clustering rules encode real bugs that were fixed once and must stay fixed —
// role-split colors, alpha-blindness, and the relative drift gate all had regressions.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { ANALYZE_DRIFT, tmpProject, cleanupTmpProjects, runScript, read, readJSON } from "./helpers/fixtures.mjs";

after(cleanupTmpProjects);

/** Build a fixture project whose computed-tokens.json holds the given properties. */
function driftProject(properties, clustering) {
  const files = {
    "design-audit/computed-tokens.json": { storyCount: 12, properties },
  };
  if (clustering) files["design-audit/audit.config.json"] = { clustering };
  return tmpProject(files);
}

const val = (value, count, components = ["Fixture"]) => ({ value, count, components });

function analyze(properties, clustering) {
  const dir = driftProject(properties, clustering);
  const res = runScript(ANALYZE_DRIFT, { cwd: dir });
  assert.equal(res.status, 0, `analyze-drift failed: ${res.all}`);
  return { dir, ...res, tokens: readJSON(dir, "design-audit/suggested-tokens.json"), report: read(dir, "design-audit/drift-report.md") };
}

describe("analyze-drift outputs", () => {
  test("emits a report and a suggested-tokens file", () => {
    const { report, tokens } = analyze({ color: [val("rgb(0, 0, 0)", 40), val("rgb(4, 4, 4)", 1)] });

    assert.match(report, /# Drift report/);
    assert.match(report, /## Text color/);
    assert.equal(tokens.driftCount, 1);
    assert.equal(tokens.replacements[0].value, "rgb(4, 4, 4)");
    assert.equal(tokens.replacements[0].canonical, "rgb(0, 0, 0)");
    assert.equal(tokens.replacements[0].intentional, false);
  });

  test("exits with a usable message when the input is missing", () => {
    const dir = tmpProject({});
    const { status, all } = runScript(ANALYZE_DRIFT, { cwd: dir });

    assert.equal(status, 1);
    assert.match(all, /computed-tokens\.json/);
    assert.match(all, /extract-computed-styles/);
  });
});

describe("analyze-drift clustering", () => {
  // Regression: colors are pooled per design role, so one raw value can legitimately
  // be drift in more than one group. Keying suggestions by value alone let the later
  // group silently overwrite the earlier one — driftCount said 2, replacements had 1.
  test("keeps one suggestion per group when a value drifts in two groups", () => {
    const { tokens } = analyze({
      color: [val("rgb(0, 0, 0)", 100, ["Text"]), val("rgb(10, 10, 10)", 1, ["Text"])],
      borderColor: [val("rgb(0, 0, 0)", 100, ["Card"]), val("rgb(10, 10, 10)", 1, ["Card"])],
    });

    assert.equal(tokens.driftCount, 2);
    assert.equal(tokens.replacements.length, 2, "driftCount and replacements must not disagree");
    assert.deepEqual(tokens.replacements.map((r) => r.group).sort(), ["color-border", "color-text"]);
    assert.ok(tokens.replacements.every((r) => r.value === "rgb(10, 10, 10)"));
  });

  test("never merges colors across meaningfully different alpha", () => {
    const { tokens } = analyze({ color: [val("rgba(0, 0, 0, 1)", 100), val("rgba(0, 0, 0, 0.5)", 1)] });

    assert.equal(tokens.driftCount, 0, "a 50%-opacity value is a distinct design decision, not drift");
  });

  test("does not pool distinct color roles into one cluster", () => {
    const { tokens } = analyze({
      color: [val("rgb(0, 0, 0)", 50)],
      backgroundColor: [val("rgb(2, 2, 2)", 50)],
    });

    assert.equal(tokens.driftCount, 0, "text vs background are separate scales even when RGB-close");
  });

  test("flags a value that is small relative to its canonical, not just small absolutely", () => {
    const { tokens } = analyze({
      color: [val("rgb(0, 0, 0)", 100), val("rgb(8, 8, 8)", 50), val("rgb(5, 5, 5)", 5)],
    });

    // 50/100 is systemic (a real second value); 5/100 is drift despite being used > driftMaxUsage.
    assert.equal(tokens.driftCount, 1);
    assert.equal(tokens.replacements[0].value, "rgb(5, 5, 5)");
    assert.equal(tokens.replacements[0].canonical, "rgb(0, 0, 0)", "canonical is the most-used real value");
  });

  test("clusters spacing within tolerance and leaves a real step alone", () => {
    const { tokens } = analyze({
      padding: [val("16px", 80), val("17px", 1)],
      margin: [val("32px", 40)],
    });

    assert.equal(tokens.driftCount, 1);
    assert.equal(tokens.replacements[0].value, "17px");
    assert.equal(tokens.replacements[0].group, "space");
  });

  test("treats exact-match groups as identity, never as a scale", () => {
    const { tokens } = analyze({ fontWeight: [val("400", 100), val("401", 1)] });

    assert.equal(tokens.driftCount, 0, "font weights don't cluster by proximity");
  });
});

describe("analyze-drift config", () => {
  test("honours clustering overrides from audit.config.json", () => {
    const properties = { color: [val("rgb(0, 0, 0)", 100), val("rgb(10, 10, 10)", 1)] };

    assert.equal(analyze(properties).tokens.driftCount, 1, "flagged under the defaults");
    assert.equal(
      analyze(properties, { driftMaxUsage: 0, driftMaxUsageRatio: 0 }).tokens.driftCount,
      0,
      "a project that disables both drift gates gets no suggestions",
    );
  });

  test("a tighter colorDistance splits a cluster the default would merge", () => {
    const properties = { color: [val("rgb(0, 0, 0)", 100), val("rgb(10, 10, 10)", 1)] };

    assert.equal(analyze(properties, { colorDistance: 5 }).tokens.driftCount, 0, "too far apart to be drift");
  });
});
