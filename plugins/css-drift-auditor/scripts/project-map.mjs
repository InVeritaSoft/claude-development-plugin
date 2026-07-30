#!/usr/bin/env node
/**
 * project-map.mjs — universal component catalog, Storybook coverage, routes.
 * Framework-agnostic (.tsx/.jsx/.vue/.svelte). Emits design-audit/project-map.json.
 * Reads design-audit/framework.json if present.
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const fw = readJSON(path.join(ROOT, "design-audit", "framework.json")) ||
  { framework: "react", componentExts: [".tsx", ".jsx", ".ts", ".js"], srcDirs: ["src"] };
const exts = fw.componentExts || [".tsx", ".jsx", ".ts", ".js"];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, acc); else acc.push(f);
  }
  return acc;
}

const dirs = (fw.srcDirs?.length ? fw.srcDirs : ["src", "components", "app"]).map((d) => path.join(ROOT, d));
const files = [...new Set(dirs.flatMap((d) => walk(d)))];

const isStory = (f) => /\.stories\.[jt]sx?$|\.stories\.(vue|svelte)$/.test(f);
const isCode = (f) => exts.some((x) => f.endsWith(x)) || f.endsWith(".vue") || f.endsWith(".svelte");
// PascalCase-filename is a React/Vue/Svelte convention (Button.tsx); Angular components are
// kebab-case files (dashboard.component.ts) carrying a PascalCase *class* instead — applying the
// filename check there discards every component and silently reports zero, framework-wide.
const isAngular = fw.framework === "angular";
const isPascal = (f) => /^[A-Z]/.test(path.basename(f).replace(/\.[^.]+$/, ""));
const isAngularComponent = (f) => f.endsWith(".component.ts");

const storyNames = new Set(
  files.filter(isStory).map((f) =>
    path.basename(f).replace(/\.stories\.[jt]sx?$/, "").replace(/\.stories\.(vue|svelte)$/, ""))
);

function importCount(f) {
  try {
    const s = fs.readFileSync(f, "utf8");
    const out = new Set();
    const re = /from\s+['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(s))) if (m[1].startsWith(".") || m[1].startsWith("@/")) out.add(m[1]);
    return out.size;
  } catch { return 0; }
}

// Angular's catalog name is the exported class (what a story file names itself after), not the
// kebab-case filename.
function componentName(f) {
  if (isAngular) {
    try {
      const m = fs.readFileSync(f, "utf8").match(/export\s+class\s+(\w+)/);
      if (m) return m[1];
    } catch {}
  }
  return path.basename(f).replace(/\.[^.]+$/, "");
}

const components = files
  .filter((f) => isCode(f) && !isStory(f) && !/\.(test|spec|d)\./.test(f) &&
    (isAngular ? isAngularComponent(f) : isPascal(f)))
  .map((f) => {
    const name = componentName(f);
    return { name, file: path.relative(ROOT, f), hasStory: storyNames.has(name), localImports: importCount(f) };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

let routes = [];
const routeDir = ["src/app", "app", "src/pages", "pages"]
  .map((d) => path.join(ROOT, d)).find(fs.existsSync);
if (routeDir) {
  const pagesStyle = routeDir.includes("pages");
  routes = walk(routeDir)
    .filter((f) => pagesStyle
      ? isCode(f) && !/_app|_document|[\\/]api[\\/]/.test(f)
      : /[\\/](page|route)\.[jt]sx?$/.test(f))
    .map((f) => path.relative(ROOT, f));
}

const out = {
  generatedAt: new Date().toISOString(),
  framework: fw.framework,
  summary: {
    components: components.length,
    withStories: components.filter((c) => c.hasStory).length,
    withoutStories: components.filter((c) => !c.hasStory).length,
    routes: routes.length,
  },
  components,
  routes,
};

fs.mkdirSync(path.join(ROOT, "design-audit"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "design-audit", "project-map.json"), JSON.stringify(out, null, 2));

console.log(`\n✓ design-audit/project-map.json`);
console.log(`  ${out.summary.components} components · ${out.summary.withStories} with stories · ` +
  `${out.summary.withoutStories} need stories · ${out.summary.routes} routes\n`);
