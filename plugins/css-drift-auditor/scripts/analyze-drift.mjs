#!/usr/bin/env node
/**
 * analyze-drift.mjs — clusters computed values into a token scale and flags
 * low-usage outliers as drift. Dependency-free.
 * Emits design-audit/drift-report.md and design-audit/suggested-tokens.json.
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "design-audit");
const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const fullCfg = readJSON(path.join(OUT, "audit.config.json")) || {};
const cfg = fullCfg.clustering ||
  { colorDistance: 24, spacingTolerancePx: 2, fontSizeTolerancePx: 1, driftMaxUsage: 2 };
const gridCfg = fullCfg.grid || { scale: [2, 4, 8, 16, 32, 64, 128, 256, 512], tolerancePx: cfg.spacingTolerancePx, properties: ["padding", "margin", "gap", "borderRadius", "borderWidth"] };
const data = readJSON(path.join(OUT, "computed-tokens.json"));
if (!data) { console.error("✗ design-audit/computed-tokens.json not found. Run extract-computed-styles.mjs first."); process.exit(1); }
const props = data.properties || {};

const parseRgb = (v) => { const m = v.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(",").map(parseFloat); return [p[0], p[1], p[2]]; };
const colorDist = (a, b) => { const A = parseRgb(a), B = parseRgb(b); if (!A || !B) return Infinity; return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
const px = (v) => { const m = String(v).match(/^(-?[\d.]+)px$/); return m ? parseFloat(m[1]) : null; };
const pxDist = (a, b) => { const A = px(a), B = px(b); if (A == null || B == null) return Infinity; return Math.abs(A - B); };
const exactDist = (a, b) => (a === b ? 0 : Infinity);

const gridTol = gridCfg.tolerancePx ?? cfg.spacingTolerancePx;
function nearestGridStep(valuePx) {
  let best = null;
  for (const step of gridCfg.scale) {
    const delta = Math.abs(valuePx - step);
    if (best === null || delta < best.delta) best = { step, delta };
  }
  return best;
}
function offGridEntries(list) {
  const out = [];
  for (const item of list) {
    const v = px(item.value);
    if (v == null || v === 0) continue;
    const nearest = nearestGridStep(v);
    if (nearest && nearest.delta > gridTol) out.push({ ...item, nearestStep: nearest.step, deltaPx: nearest.delta });
  }
  return out.sort((a, b) => b.count - a.count);
}

function pool(propNames) {
  const map = new Map();
  for (const name of propNames) {
    for (const item of (props[name] || [])) {
      const cur = map.get(item.value) || { value: item.value, count: 0, components: new Set() };
      cur.count += item.count;
      (item.components || []).forEach((c) => cur.components.add(c));
      map.set(item.value, cur);
    }
  }
  return [...map.values()].map((x) => ({ ...x, components: [...x.components] })).sort((a, b) => b.count - a.count);
}

function cluster(list, distFn, tol) {
  const clusters = [];
  for (const item of list) {
    const c = clusters.find((c) => distFn(c.canonical.value, item.value) <= tol);
    if (c) c.members.push(item); else clusters.push({ canonical: item, members: [item] });
  }
  return clusters;
}

const groups = [
  { label: "Colors", prefix: "--color", props: ["color", "backgroundColor", "borderColor"], dist: colorDist, tol: cfg.colorDistance },
  { label: "Spacing (padding/margin/gap)", prefix: "--space", props: ["padding", "margin", "gap"], dist: pxDist, tol: cfg.spacingTolerancePx },
  { label: "Font size", prefix: "--font-size", props: ["fontSize"], dist: pxDist, tol: cfg.fontSizeTolerancePx },
  { label: "Border radius", prefix: "--radius", props: ["borderRadius"], dist: pxDist, tol: cfg.spacingTolerancePx },
  { label: "Border width", prefix: "--border-width", props: ["borderWidth"], dist: pxDist, tol: 1 },
  { label: "Font weight", prefix: "--font-weight", props: ["fontWeight"], dist: exactDist, tol: 0 },
  { label: "Line height", prefix: "--line-height", props: ["lineHeight"], dist: exactDist, tol: 0 },
  { label: "Font family", prefix: "--font-family", props: ["fontFamily"], dist: exactDist, tol: 0 },
  { label: "Box shadow", prefix: "--shadow", props: ["boxShadow"], dist: exactDist, tol: 0 },
  { label: "z-index", prefix: "--z", props: ["zIndex"], dist: exactDist, tol: 0 },
];

let md = `# Drift report\n\nGenerated: \`${new Date().toISOString()}\`  \nSource: Storybook computed styles (${data.storyCount} stories)\n\n`;
md += `Values used \u2264 ${cfg.driftMaxUsage}\u00d7 that sit within tolerance of a more-common value are flagged **drift \u2192 canonical**.\n\n---\n\n`;

const suggested = {};
let totalDrift = 0;
const gridViolations = [];

for (const g of groups) {
  const list = pool(g.props);
  if (!list.length) continue;
  const clusters = cluster(list, g.dist, g.tol);
  const lines = [];
  let i = 1;
  for (const c of clusters) {
    const token = `${g.prefix}-${i}`;
    const drifts = c.members.filter((m) => m.value !== c.canonical.value && m.count <= cfg.driftMaxUsage);
    for (const d of drifts) {
      suggested[d.value] = { token, canonical: c.canonical.value, group: g.prefix.slice(2), intentional: false };
      const used = d.components.slice(0, 3).join(", ") + (d.components.length > 3 ? "\u2026" : "");
      lines.push(`| \`${token}\` | \`${c.canonical.value}\` (${c.canonical.count}\u00d7) | \`${d.value}\` (${d.count}\u00d7) | ${used} |`);
      totalDrift++;
    }
    i++;
  }
  md += `## ${g.label}\n\n`;
  md += lines.length
    ? `| Token | Canonical | Drift value | Used by |\n|---|---|---|---|\n${lines.join("\n")}\n\n`
    : `_No drift \u2014 ${clusters.length} consistent value(s)._\n\n`;

  const onGrid = g.props.some((p) => gridCfg.properties.includes(p));
  if (onGrid) {
    const offGrid = offGridEntries(list);
    md += `### Off-grid values\n\n`;
    if (offGrid.length) {
      const gLines = offGrid.map((o) => {
        const used = o.components.slice(0, 3).join(", ") + (o.components.length > 3 ? "\u2026" : "");
        gridViolations.push({ value: o.value, nearestStep: `${o.nearestStep}px`, deltaPx: o.deltaPx, group: g.prefix.slice(2), count: o.count });
        return `| \`${o.value}\` (${o.count}\u00d7) | \`${o.nearestStep}px\` | ${o.deltaPx.toFixed(1)}px | ${used} |`;
      });
      md += `| Value | Nearest grid step | Delta | Used by |\n|---|---|---|---|\n${gLines.join("\n")}\n\n`;
    } else {
      md += `_All values on the grid (\u00b1${gridTol}px)._\n\n`;
    }
  }
}

md += `---\n\n**${totalDrift} drift values flagged.** ${gridViolations.length} off-grid values flagged against the [${gridCfg.scale.join(", ")}] scale. Mark intentional one-offs with \`"intentional": true\` in suggested-tokens.json before running fix agents.\n`;

const suggestedOut = {
  generatedAt: new Date().toISOString(),
  driftCount: totalDrift,
  replacements: Object.entries(suggested).map(([value, info]) => ({ value, ...info })),
  gridViolations,
};

fs.writeFileSync(path.join(OUT, "drift-report.md"), md);
fs.writeFileSync(path.join(OUT, "suggested-tokens.json"), JSON.stringify(suggestedOut, null, 2));

console.log(`\n✓ design-audit/drift-report.md`);
console.log(`✓ design-audit/suggested-tokens.json`);
console.log(`\n  ${totalDrift} drift values flagged across ${groups.length} token groups`);
console.log(`  ${gridViolations.length} off-grid values flagged against the [${gridCfg.scale.join(", ")}] scale\n`);
