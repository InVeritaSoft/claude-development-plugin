#!/usr/bin/env node
/**
 * analyze-drift.mjs — clusters computed values into a token scale and flags
 * drift outliers. Dependency-free.
 * Emits design-audit/drift-report.md and design-audit/suggested-tokens.json.
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "design-audit");
const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const DEFAULT_CFG = { colorDistance: 24, colorAlphaTolerance: 0.05, spacingTolerancePx: 2, fontSizeTolerancePx: 1, driftMaxUsage: 2, driftMaxUsageRatio: 0.15 };
const cfg = { ...DEFAULT_CFG, ...((readJSON(path.join(OUT, "audit.config.json")) || {}).clustering || {}) };
const data = readJSON(path.join(OUT, "computed-tokens.json"));
if (!data) { console.error("✗ design-audit/computed-tokens.json not found. Run extract-computed-styles.mjs first."); process.exit(1); }
const props = data.properties || {};

// --- Value parsing ----------------------------------------------------------
const parseRgba = (v) => {
  const m = String(v).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(",").map((x) => parseFloat(x.trim()));
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
};
const px = (v) => { const m = String(v).match(/^(-?[\d.]+)px$/); return m ? parseFloat(m[1]) : null; };

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

// --- Clustering --------------------------------------------------------------
//
// Exact-match groups (fontWeight, lineHeight, fontFamily, boxShadow, zIndex):
// distance is binary (0 or Infinity), so grouping by strict string equality
// is already correct and order-independent — no chaining is possible when a
// value only ever joins an identical value.
//
// Continuous groups (color, spacing/px): the previous approach compared each
// new item only to a cluster's *fixed first-seen* member ("canonical"),
// never to the cluster as it evolved. That's single-linkage-to-a-frozen-seed,
// which chains: item A (dist 2 from seed) and item B (dist 2 from seed, but
// 4 from A) both join the same cluster even though A and B themselves may be
// visually distinguishable. We instead maintain a running weighted centroid
// per cluster and compare against that, re-averaging as members join — this
// keeps clusters tight around their actual weighted center rather than
// drifting arbitrarily far from where they started.

function clusterExact(list) {
  const clusters = [];
  for (const item of list) {
    const c = clusters.find((c) => c.canonical.value === item.value);
    if (c) c.members.push(item); else clusters.push({ canonical: item, members: [item] });
  }
  return clusters;
}

function clusterContinuous(list, { toVector, distance, tol }) {
  const clusters = []; // { centroid, weight, canonical, members }
  for (const item of list) {
    const v = toVector(item.value);
    if (v == null) { clusters.push({ centroid: null, weight: item.count, canonical: item, members: [item] }); continue; }
    let best = null, bestDist = Infinity;
    for (const c of clusters) {
      if (!c.centroid) continue;
      const d = distance(c.centroid, v);
      if (d <= tol && d < bestDist) { best = c; bestDist = d; }
    }
    if (best) {
      const w = best.weight + item.count;
      best.centroid = best.centroid.map((x, i) => (x * best.weight + v[i] * item.count) / w);
      best.weight = w;
      best.members.push(item);
      if (item.count > best.canonical.count) best.canonical = item; // canonical = most-used real value, not the synthetic centroid
    } else {
      clusters.push({ centroid: v, weight: item.count, canonical: item, members: [item] });
    }
  }
  return clusters;
}

function colorDistance([ar, ag, ab, aa], [br, bg, bb, ba]) {
  if (Math.abs(aa - ba) > cfg.colorAlphaTolerance) return Infinity; // never merge across meaningfully different opacity
  return Math.hypot(ar - br, ag - bg, ab - bb);
}
const pxVector = (v) => { const n = px(v); return n == null ? null : [n]; };
const pxDistance = ([a], [b]) => Math.abs(a - b);

// Colors are split by design role — text, background, border are semantically
// distinct even when two values happen to be RGB-close, and pooling them
// (as the previous version did) produced cross-role false positives.
const groups = [
  { label: "Text color", prefix: "--color-text", props: ["color"], type: "color" },
  { label: "Background color", prefix: "--color-bg", props: ["backgroundColor"], type: "color" },
  { label: "Border color", prefix: "--color-border", props: ["borderColor"], type: "color" },
  { label: "Spacing (padding/margin/gap)", prefix: "--space", props: ["padding", "margin", "gap"], type: "px", tol: cfg.spacingTolerancePx },
  { label: "Font size", prefix: "--font-size", props: ["fontSize"], type: "px", tol: cfg.fontSizeTolerancePx },
  { label: "Border radius", prefix: "--radius", props: ["borderRadius"], type: "px", tol: cfg.spacingTolerancePx },
  { label: "Border width", prefix: "--border-width", props: ["borderWidth"], type: "px", tol: 1 },
  { label: "Font weight", prefix: "--font-weight", props: ["fontWeight"], type: "exact" },
  { label: "Line height", prefix: "--line-height", props: ["lineHeight"], type: "exact" },
  { label: "Font family", prefix: "--font-family", props: ["fontFamily"], type: "exact" },
  { label: "Box shadow", prefix: "--shadow", props: ["boxShadow"], type: "exact" },
  { label: "z-index", prefix: "--z", props: ["zIndex"], type: "exact" },
];

function clusterGroup(g, list) {
  if (g.type === "exact") return clusterExact(list);
  if (g.type === "color") return clusterContinuous(list, { toVector: parseRgba, distance: colorDistance, tol: cfg.colorDistance });
  return clusterContinuous(list, { toVector: pxVector, distance: pxDistance, tol: g.tol });
}

// A member is drift if it isn't the canonical AND either its absolute usage
// is small (driftMaxUsage) OR it's small *relative to the canonical*
// (driftMaxUsageRatio) — the relative check is what catches systemic drift
// (e.g. a stale value used 20x sitting alongside one used 60x), which a
// flat absolute-count gate structurally cannot see.
function isDrift(member, canonical) {
  if (member.value === canonical.value) return false;
  if (member.count <= cfg.driftMaxUsage) return true;
  return member.count / canonical.count <= cfg.driftMaxUsageRatio;
}

let md = `# Drift report\n\nGenerated: \`${new Date().toISOString()}\`  \nSource: Storybook computed styles (${data.storyCount} stories)\n\n`;
md += `A value is flagged **drift → canonical** when it sits within tolerance of a cluster's canonical value and is either used \u2264 ${cfg.driftMaxUsage}\u00d7 in absolute terms, or used at \u2264 ${Math.round(cfg.driftMaxUsageRatio * 100)}% of the canonical's usage count.\n\n---\n\n`;

// Keyed by group + value, not value alone: now that colors are split by role,
// the same raw value can legitimately be drift in more than one group (e.g.
// `rgb(0, 0, 0)` drifting in both text and border). Keying by value alone let
// the later group silently overwrite the earlier one.
const suggested = new Map();
let totalDrift = 0;

for (const g of groups) {
  const list = pool(g.props);
  if (!list.length) continue;
  const clusters = clusterGroup(g, list);
  const lines = [];
  let i = 1;
  for (const c of clusters) {
    const token = `${g.prefix}-${i}`;
    const drifts = c.members.filter((m) => isDrift(m, c.canonical));
    for (const d of drifts) {
      const group = g.prefix.replace(/^--/, "");
      suggested.set(`${group}\u0000${d.value}`, { value: d.value, token, canonical: c.canonical.value, group, intentional: false });
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
}

md += `---\n\n**${totalDrift} drift values flagged.** Mark intentional one-offs with \`"intentional": true\` in suggested-tokens.json before running fix agents.\n`;

const suggestedOut = {
  generatedAt: new Date().toISOString(),
  driftCount: totalDrift,
  replacements: [...suggested.values()],
};

fs.writeFileSync(path.join(OUT, "drift-report.md"), md);
fs.writeFileSync(path.join(OUT, "suggested-tokens.json"), JSON.stringify(suggestedOut, null, 2));

console.log(`\n✓ design-audit/drift-report.md`);
console.log(`✓ design-audit/suggested-tokens.json`);
console.log(`\n  ${totalDrift} drift values flagged across ${groups.length} token groups\n`);
