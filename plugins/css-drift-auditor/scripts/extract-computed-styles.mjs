#!/usr/bin/env node
/**
 * extract-computed-styles.mjs — THE strengthening.
 *
 * Renders every Storybook story in a headless browser and reads
 * getComputedStyle() off the live DOM. This captures the post-cascade pixel
 * value AFTER Tailwind classes, theme providers, CSS variables, and
 * inheritance resolve — drift that source-level analysis structurally cannot
 * see. The browser also normalizes values (#2e2e2e, rgb(46,46,46), and a
 * theme var all collapse to "rgb(46, 46, 46)"), so dedup is exact.
 *
 *   node extract-computed-styles.mjs                      # dev server @ :6006
 *   node extract-computed-styles.mjs --url http://localhost:6006
 *   node extract-computed-styles.mjs --static storybook-static   # built SB
 *
 * Requires Playwright in the target project:
 *   npm i -D playwright && npx playwright install chromium
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { createRequire } from "module";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };

const config = loadConfig();
const SB_URL = getArg("--url", config.storybook.url);
const STATIC_DIR = getArg("--static", null);
const OUT_DIR = path.join(ROOT, config.output.dir);
const PROPS = config.extract.properties;
const IGNORE = config.extract.ignoreValues;
const PER_STORY_TIMEOUT = config.extract.perStoryTimeoutMs || 8000;

function loadConfig() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(ROOT, "design-audit", "audit.config.json"),
    path.join(here, "..", "config", "audit.config.json"),
  ];
  for (const p of candidates) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch {} }
  return {
    storybook: { url: "http://localhost:6006" },
    extract: {
      properties: ["color", "backgroundColor", "fontSize", "fontWeight", "fontFamily", "lineHeight", "borderRadius", "boxShadow", "padding", "margin", "gap"],
      ignoreValues: ["rgba(0, 0, 0, 0)", "none", "normal", "0px", "auto"],
      perStoryTimeoutMs: 8000,
      gapCollapse: { enabled: true, maxOverlapPx: 0 },
    },
    output: { dir: "design-audit" },
  };
}
const GAP_CFG = { enabled: true, maxOverlapPx: 0, ...(config.extract.gapCollapse || {}) };

async function getChromium() {
  // Resolve Playwright from the target project (cwd), not the plugin dir.
  const tryImport = async (name) => {
    try {
      const req = createRequire(path.join(ROOT, "__resolve__.js"));
      return await import(pathToFileURL(req.resolve(name)).href);
    } catch {}
    try { return await import(name); } catch {}
    return null;
  };
  const pw = await tryImport("playwright");
  // playwright/index.js does `module.exports = require('playwright-core')` —
  // a dynamic re-export that Node's cjs-module-lexer can't statically
  // analyze, so a dynamic import() only ever exposes it under `.default`,
  // not as a synthesized named export. Check both shapes.
  const chromium = pw?.chromium || pw?.default?.chromium;
  if (chromium) return chromium;
  console.error("\n✗ Playwright not found in your project. Install:\n  npm i -D playwright && npx playwright install chromium\n");
  process.exit(1);
}

async function loadStoryIndex() {
  if (STATIC_DIR) {
    for (const f of ["index.json", "stories.json"]) {
      const p = path.join(ROOT, STATIC_DIR, f);
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
    }
    throw new Error(`No index.json in ${STATIC_DIR} — run build-storybook first.`);
  }
  for (const f of ["index.json", "stories.json"]) {
    try { const res = await fetch(`${SB_URL}/${f}`); if (res.ok) return await res.json(); } catch {}
  }
  throw new Error(`Could not fetch story index from ${SB_URL} — is Storybook running?`);
}

function listStories(index) {
  const entries = index.entries || index.stories || {};
  return Object.values(entries)
    .filter((e) => (e.type ? e.type === "story" : true))
    .map((e) => ({ id: e.id, title: e.title, name: e.name }));
}

// Serialized into the browser context per story. Playwright's page.evaluate
// only forwards a single serializable arg to the page function (unlike
// Puppeteer, which allows variadic args) — bundle everything into one object.
function extractFromDOM({ props, ignoreList }) {
  const ignore = new Set(ignoreList);
  const root = document.querySelector("#storybook-root") || document.querySelector("#root") || document.body;
  const corner = {
    borderRadius: ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius"],
    padding: ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"],
    margin: ["marginTop", "marginRight", "marginBottom", "marginLeft"],
    gap: ["rowGap", "columnGap"],
    borderColor: ["borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor"],
    borderWidth: ["borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth"],
  };
  const out = {};
  const record = (prop, val) => {
    if (!val || ignore.has(val)) return;
    (out[prop] = out[prop] || {})[val] = (out[prop][val] || 0) + 1;
  };
  for (const el of root.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    for (const prop of props) {
      if (corner[prop]) for (const sub of corner[prop]) record(prop, cs[sub]);
      else record(prop, cs[prop]);
    }
  }
  return out;
}

// Distinct drift surface from extractFromDOM's value histogram: that one asks
// "is this computed value off the token scale?" — a statistical question,
// tolerant of one-offs. This asks "does a container's OWN declared gap
// actually hold?" — a binary defect. A flex/grid container with a non-zero
// `gap` whose visible children still end up touching (or overlapping) is a
// real regression regardless of how rare it is: an ancestor override, a
// specificity fight, or a stray `gap: 0 !important` zeroed the spacing the
// component itself asked for. No clustering tolerance applies — one instance
// is exactly as real as a hundred.
function detectGapCollapses({ maxOverlapPx }) {
  const root = document.querySelector("#storybook-root") || document.querySelector("#root") || document.body;
  const out = [];
  for (const el of root.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.display !== "flex" && cs.display !== "grid") continue;
    if (!cs.gap || cs.gap === "0px") continue; // only containers that declare gap-based spacing at all
    if (el.children.length < 2) continue;

    const kids = Array.from(el.children).filter((k) => {
      const r = k.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (kids.length < 2) continue;

    const vertical = cs.flexDirection === "column" || cs.display === "grid";
    let collapsedAt = null;
    for (let i = 0; i < kids.length - 1; i++) {
      const a = kids[i].getBoundingClientRect();
      const b = kids[i + 1].getBoundingClientRect();
      const spacing = vertical ? b.top - a.bottom : b.left - a.right;
      if (spacing <= maxOverlapPx) { collapsedAt = spacing; break; }
    }
    if (collapsedAt !== null) {
      out.push({
        tag: el.tagName.toLowerCase(),
        className: el.className && el.className.toString ? el.className.toString().trim().slice(0, 120) : "",
        declaredGap: cs.gap,
        childCount: kids.length,
        actualSpacingPx: Math.round(collapsedAt * 100) / 100,
      });
    }
  }
  return out;
}

(async () => {
  const chromium = await getChromium();
  const index = await loadStoryIndex();
  const stories = listStories(index);
  if (!stories.length) { console.error("No stories found in index."); process.exit(1); }

  console.log(`\n🎨 Extracting computed styles from ${stories.length} stories\n`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // Never let a stray confirm()/alert()/prompt() in a story block the whole
  // run — auto-dismiss so a single misbehaving component can't stall the
  // serial extraction loop.
  page.on("dialog", (d) => d.dismiss().catch(() => {}));

  // Track uncaught page errors and error-level console output per story. A
  // story that throws during render doesn't always reject page.goto/evaluate
  // — Storybook's own error boundary/overlay still populates the DOM, so a
  // naive extraction would silently scrape that error UI's styling as if it
  // were real design values. Treat any error signal during a story's load
  // window as a hard skip instead.
  let storyErrors = [];
  page.on("pageerror", (e) => storyErrors.push(String(e.message || e)));
  page.on("console", (msg) => { if (msg.type() === "error") storyErrors.push(msg.text()); });

  // Known Storybook error-boundary/overlay markers across SB6–8, as a
  // second, DOM-based signal independent of the JS error events above.
  const ERROR_SELECTOR = "#error-message, #error-stack, .sb-errordisplay, [class*='errordisplay'], [id*='error-message']";

  const agg = {}; // prop -> value -> { count, stories:Set, components:Set }
  const merge = (storyId, title, dom) => {
    for (const [prop, vals] of Object.entries(dom)) {
      const bucket = (agg[prop] = agg[prop] || {});
      for (const [val, n] of Object.entries(vals)) {
        const rec = (bucket[val] = bucket[val] || { count: 0, stories: new Set(), components: new Set() });
        rec.count += n; rec.stories.add(storyId); rec.components.add(title);
      }
    }
  };

  // Keyed by tag+className+declaredGap, not by story — the same component
  // rendering across several stories should count as one drift site, not one
  // per story that happened to hit it.
  const gapAgg = {};
  const mergeGapCollapses = (storyId, title, list) => {
    for (const c of list) {
      const key = `${c.tag}\u0000${c.className}\u0000${c.declaredGap}`;
      const rec = (gapAgg[key] = gapAgg[key] || {
        tag: c.tag, className: c.className, declaredGap: c.declaredGap,
        count: 0, stories: new Set(), components: new Set(), worstSpacingPx: c.actualSpacingPx,
      });
      rec.count++; rec.stories.add(storyId); rec.components.add(title);
      if (c.actualSpacingPx < rec.worstSpacingPx) rec.worstSpacingPx = c.actualSpacingPx;
    }
  };

  const base = STATIC_DIR ? `file://${path.join(ROOT, STATIC_DIR)}` : SB_URL;
  let done = 0, skipped = 0, skippedErrors = 0;
  for (const story of stories) {
    const url = `${base}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`;
    storyErrors = [];
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: PER_STORY_TIMEOUT });
      await page.waitForSelector("#storybook-root > *, #root > *", { timeout: 3000 }).catch(() => {});
      // Give the error boundary/console a brief window to fire after the
      // initial paint, since React error logging can lag the first frame.
      await page.waitForTimeout(50);
      const hasErrorDom = await page.locator(ERROR_SELECTOR).count().then((n) => n > 0).catch(() => false);
      if (storyErrors.length || hasErrorDom) {
        skipped++; skippedErrors++;
        process.stderr.write(`  ⚠ skip ${story.id} (render error): ${(storyErrors[0] || "error UI detected").split("\n")[0]}\n`);
      } else {
        const dom = await page.evaluate(extractFromDOM, { props: PROPS, ignoreList: IGNORE });
        merge(story.id, story.title, dom);
        if (GAP_CFG.enabled) {
          const collapses = await page.evaluate(detectGapCollapses, { maxOverlapPx: GAP_CFG.maxOverlapPx });
          mergeGapCollapses(story.id, story.title, collapses);
        }
      }
    } catch (e) {
      skipped++;
      process.stderr.write(`  ⚠ skip ${story.id}: ${String(e.message).split("\n")[0]}\n`);
    }
    done++;
    if (done % 10 === 0 || done === stories.length) process.stdout.write(`  ${done}/${stories.length}\r`);
  }
  await browser.close();

  const output = {
    generatedAt: new Date().toISOString(),
    source: "storybook-computed",
    storyCount: stories.length,
    skipped,
    skippedErrors,
    properties: {},
  };
  for (const [prop, vals] of Object.entries(agg)) {
    output.properties[prop] = Object.entries(vals)
      .map(([value, rec]) => ({ value, count: rec.count, stories: rec.stories.size, components: [...rec.components].sort() }))
      .sort((a, b) => b.count - a.count);
  }

  output.gapCollapses = Object.values(gapAgg)
    .map((rec) => ({
      tag: rec.tag, className: rec.className, declaredGap: rec.declaredGap,
      count: rec.count, stories: rec.stories.size, worstSpacingPx: rec.worstSpacingPx,
      components: [...rec.components].sort(),
    }))
    .sort((a, b) => b.count - a.count);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, "computed-tokens.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log(`\n\n✓ ${path.relative(ROOT, outPath)}  (${skipped} stories skipped, ${skippedErrors} of those were render errors)`);
  for (const [prop, list] of Object.entries(output.properties)) {
    console.log(`  ${prop.padEnd(16)} ${list.length} distinct values`);
  }
  if (GAP_CFG.enabled) {
    console.log(`  ${"gapCollapses".padEnd(16)} ${output.gapCollapses.length} distinct container(s) with a collapsed gap`);
  }
  console.log("");
})();
