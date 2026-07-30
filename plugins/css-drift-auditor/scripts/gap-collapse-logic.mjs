// Pure, browser-free logic for gap-collapse detection — the canonical source of truth, unit
// tested here. The in-browser copies (extract-computed-styles.mjs's detectGapCollapses, and the
// equivalent inline checks the css-drift-audit consumers write into their own E2E suites) can't
// import this: a function passed to Playwright's page.evaluate() is serialized by itself, with no
// access to modules from outside its own closure. Keep those copies textually in lockstep with
// this one — this file exists so the actual grouping algorithm has one tested definition instead
// of being re-derived (and re-bugged) at each call site.
//
// Why line-grouping is required, not optional: a flex-row container that WRAPS is the common case
// (a filter bar, a button toolbar, a responsive card grid). Comparing DOM-adjacent children's
// horizontal position without first grouping them into visual lines produces constant false
// positives — the first child of line 2 sits far to the LEFT of the last child of line 1 (it wraps
// back to the container's start edge), which naive adjacent-pair comparison reads as a deep
// negative "gap", i.e. a collapse that never happened. This was shipped and caught live against a
// real page (portal/people's filter row, 8 fields wrapping across 3 lines at 12px gap) before this
// fix — the naive version flagged it as collapsed on every load.

/**
 * @param {{left:number, right:number, top:number, bottom:number}[]} rects - visible children's
 *   bounding rects, in DOM order (not required to be pre-sorted).
 * @param {{flexDirection?: string, display?: string}} containerStyle
 * @param {number} maxOverlapPx - spacing at or below this counts as collapsed (0 = touching).
 * @returns {{spacing: number} | null} the first collapse found, or null if none.
 */
export function findGapCollapse(rects, containerStyle, maxOverlapPx = 0) {
  if (rects.length < 2) return null;

  const isColumnLike =
    containerStyle.flexDirection === "column" || containerStyle.flexDirection === "column-reverse";

  if (isColumnLike) {
    // A column-direction flex container is a single line unless flex-wrap is set AND the
    // container has a constrained cross-axis size (rare) — treat as one line, top-to-bottom.
    const sorted = [...rects].sort((a, b) => a.top - b.top);
    for (let i = 0; i < sorted.length - 1; i++) {
      const spacing = sorted[i + 1].top - sorted[i].bottom;
      if (spacing <= maxOverlapPx) return { spacing };
    }
    return null;
  }

  // Row-direction flex (the default) or grid: children can span multiple visual lines once they
  // wrap. Group by vertical overlap into lines first, THEN compare horizontal adjacency only
  // within a line, and vertical adjacency only between consecutive lines.
  const lines = [];
  for (const r of rects) {
    let line = lines.find((L) => r.top < L.bottom && r.bottom > L.top); // vertical range overlap
    if (!line) { line = { top: r.top, bottom: r.bottom, items: [] }; lines.push(line); }
    line.items.push(r);
    line.top = Math.min(line.top, r.top);
    line.bottom = Math.max(line.bottom, r.bottom);
  }

  for (const line of lines) {
    line.items.sort((a, b) => a.left - b.left);
    for (let i = 0; i < line.items.length - 1; i++) {
      const spacing = line.items[i + 1].left - line.items[i].right;
      if (spacing <= maxOverlapPx) return { spacing };
    }
  }

  lines.sort((a, b) => a.top - b.top);
  for (let i = 0; i < lines.length - 1; i++) {
    const spacing = lines[i + 1].top - lines[i].bottom;
    if (spacing <= maxOverlapPx) return { spacing };
  }

  return null;
}
