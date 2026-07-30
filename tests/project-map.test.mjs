// project-map.mjs catalogs components per framework. The PascalCase-filename check that
// identifies a React/Vue component (Button.tsx) is a convention Angular doesn't share —
// Angular components are kebab-case files (dashboard.component.ts) carrying a PascalCase
// *class* inside. Applying the filename check there silently discarded every component and
// reported a project-wide zero, on a real 89-component Angular app. Fixed to key detection
// off framework.json instead of one universal filename shape.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { PROJECT_MAP, tmpProject, cleanupTmpProjects, runScript, readJSON } from "./helpers/fixtures.mjs";

after(cleanupTmpProjects);

function mapProject(files) {
  const dir = tmpProject(files);
  const res = runScript(PROJECT_MAP, { cwd: dir });
  assert.equal(res.status, 0, `project-map failed: ${res.all}`);
  return { dir, ...res, map: readJSON(dir, "design-audit/project-map.json") };
}

describe("project-map: React (PascalCase filenames)", () => {
  test("finds a component by its PascalCase filename", () => {
    const { map } = mapProject({
      "design-audit/framework.json": { framework: "react", componentExts: [".tsx", ".jsx"], srcDirs: ["src"] },
      "src/Button.tsx": "export function Button() { return null; }",
    });

    assert.equal(map.summary.components, 1);
    assert.equal(map.components[0].name, "Button");
  });

  test("ignores a lowercase helper file, same as before", () => {
    const { map } = mapProject({
      "design-audit/framework.json": { framework: "react", componentExts: [".tsx", ".jsx"], srcDirs: ["src"] },
      "src/utils.tsx": "export function helper() {}",
    });

    assert.equal(map.summary.components, 0);
  });
});

describe("project-map: Angular (kebab-case files, PascalCase class)", () => {
  test("finds a component by its .component.ts suffix, named after its exported class", () => {
    const { map } = mapProject({
      "design-audit/framework.json": { framework: "angular", componentExts: [".component.ts"], srcDirs: ["src"] },
      "src/app/portal/dashboard.component.ts":
        "import { Component } from '@angular/core';\n@Component({ selector: 'app-dashboard' })\nexport class DashboardComponent {}\n",
    });

    assert.equal(map.summary.components, 1, "the kebab-case filename must not disqualify it");
    assert.equal(map.components[0].name, "DashboardComponent", "catalog name is the class, not the filename");
  });

  test("a component's own story is matched by class name, not filename", () => {
    const { map } = mapProject({
      "design-audit/framework.json": { framework: "angular", componentExts: [".component.ts"], srcDirs: ["src"] },
      "src/app/portal/dashboard.component.ts":
        "import { Component } from '@angular/core';\n@Component({ selector: 'app-dashboard' })\nexport class DashboardComponent {}\n",
      "src/app/portal/DashboardComponent.stories.ts": "export default {};",
    });

    assert.equal(map.components[0].hasStory, true);
    assert.equal(map.summary.withoutStories, 0);
  });

  test("does not require a PascalCase filename (the regression itself)", () => {
    const { map } = mapProject({
      "design-audit/framework.json": { framework: "angular", componentExts: [".component.ts"], srcDirs: ["src"] },
      "src/app/portal/people/people-list.component.ts":
        "import { Component } from '@angular/core';\n@Component({ selector: 'app-people-list' })\nexport class PeopleListComponent {}\n",
    });

    assert.equal(map.summary.components, 1, "kebab-case Angular filenames must still be catalogued");
  });

  test("ignores non-.component.ts files (services, models)", () => {
    const { map } = mapProject({
      "design-audit/framework.json": { framework: "angular", componentExts: [".component.ts"], srcDirs: ["src"] },
      "src/app/portal/people.service.ts": "export class PeopleService {}",
    });

    assert.equal(map.summary.components, 0);
  });
});
