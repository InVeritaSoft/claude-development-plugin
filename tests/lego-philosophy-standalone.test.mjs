// The standalone lego-philosophy plugin must install and work with nothing else present: no
// stack.md config, no loop-stack skills. A reference to either would be a dangling promise.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./helpers/fixtures.mjs";

const skill = fs.readFileSync(path.join(REPO_ROOT, "plugins/lego-philosophy/skills/lego-philosophy/SKILL.md"), "utf8");

test("the standalone lego-philosophy skill does not depend on loop-stack", () => {
  assert.doesNotMatch(skill, /stack\.md|\$\{frontend\.|\bonboard\b|frontend-component-conventions|implement-designs|react-frontend-developer/);
});

test("the standalone lego-philosophy skill covers the major component frameworks", () => {
  for (const fw of ["React", "Vue", "Angular", "Svelte"]) assert.match(skill, new RegExp(fw));
});
