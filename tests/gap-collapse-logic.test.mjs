// findGapCollapse's line-grouping is what stands between "real collapse" and "container that
// legitimately wraps" — a naive DOM-adjacent-pair comparison flags every wrapped row as collapsed,
// which is exactly the bug caught live against a real page before this file existed (see
// gap-collapse-logic.mjs's header comment).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { findGapCollapse } from "../plugins/css-drift-auditor/scripts/gap-collapse-logic.mjs";

const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height });

describe("findGapCollapse: row-direction (default), single line", () => {
  test("no collapse when children have real horizontal spacing", () => {
    const rects = [rect(0, 0, 100, 40), rect(112, 0, 100, 40)]; // 12px gap
    assert.equal(findGapCollapse(rects, { flexDirection: "row" }), null);
  });

  test("flags a real collapse: children touching despite a declared gap", () => {
    const rects = [rect(0, 0, 100, 40), rect(100, 0, 100, 40)]; // 0 spacing
    assert.deepEqual(findGapCollapse(rects, { flexDirection: "row" }), { spacing: 0 });
  });

  test("flags an overlap as a collapse too", () => {
    const rects = [rect(0, 0, 100, 40), rect(50, 0, 100, 40)]; // overlapping by 50px
    const result = findGapCollapse(rects, { flexDirection: "row" });
    assert.ok(result && result.spacing < 0);
  });
});

describe("findGapCollapse: row-direction WITH wrap — the regression", () => {
  // Reproduces /portal/people's filter row: 8 mat-form-fields, gap: 12px, flex-wrap: wrap,
  // wrapping across 3 visual lines. The naive (pre-fix) check compared DOM-adjacent children's
  // horizontal position without grouping by line, so the first item of line 2 (far left) vs. the
  // last item of line 1 (far right) read as a deep negative "gap" — a false collapse on every load.
  test("does not flag a normally-wrapped multi-line row as collapsed", () => {
    const rects = [
      rect(272, 116, 320, 70), rect(604, 116, 220, 70), rect(836, 116, 220, 70), // line 1
      rect(272, 198, 220, 70), rect(504, 198, 220, 70), rect(736, 198, 220, 70), rect(968, 198, 220, 70), // line 2
      rect(272, 279, 220, 70), // line 3
    ];
    assert.equal(
      findGapCollapse(rects, { flexDirection: "row" }, 0),
      null,
      "wrapping to a new line is not a collapse — this exact shape false-positived before the fix",
    );
  });

  test("still catches a real collapse WITHIN one wrapped line", () => {
    const rects = [
      rect(272, 116, 320, 70), rect(592, 116, 220, 70), // line 1 — these two now touch (592 = 272+320)
      rect(272, 198, 220, 70), // line 2
    ];
    const result = findGapCollapse(rects, { flexDirection: "row" }, 0);
    assert.ok(result, "a same-line touch must still be caught even though other lines wrap normally");
  });

  test("still catches a real collapse BETWEEN two wrapped lines (row-gap)", () => {
    const rects = [
      rect(272, 116, 320, 70), rect(604, 116, 220, 70), // line 1, bottom = 186
      rect(272, 186, 220, 70), // line 2 starts exactly where line 1 ends — no row-gap held
    ];
    const result = findGapCollapse(rects, { flexDirection: "row" }, 0);
    assert.ok(result, "touching row-gap between lines must still be caught");
  });
});

describe("findGapCollapse: column-direction", () => {
  test("no collapse with real vertical spacing", () => {
    const rects = [rect(0, 0, 100, 40), rect(0, 48, 100, 40)]; // 8px gap
    assert.equal(findGapCollapse(rects, { flexDirection: "column" }), null);
  });

  test("flags a real vertical collapse", () => {
    const rects = [rect(0, 0, 100, 40), rect(0, 40, 100, 40)]; // touching
    assert.ok(findGapCollapse(rects, { flexDirection: "column" }));
  });
});

describe("findGapCollapse: edge cases", () => {
  test("fewer than two children is never a collapse", () => {
    assert.equal(findGapCollapse([rect(0, 0, 10, 10)], { flexDirection: "row" }), null);
    assert.equal(findGapCollapse([], { flexDirection: "row" }), null);
  });

  test("maxOverlapPx raises the bar for what counts as collapsed", () => {
    const rects = [rect(0, 0, 100, 40), rect(103, 0, 100, 40)]; // 3px real spacing
    assert.equal(findGapCollapse(rects, { flexDirection: "row" }, 0), null, "3px spacing is not a collapse at the default threshold");
    assert.ok(findGapCollapse(rects, { flexDirection: "row" }, 5), "raising the threshold to 5px now counts 3px as collapsed");
  });
});
