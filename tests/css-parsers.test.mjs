// The css-drift-auditor's pure surface: the shared parser helpers that decide what
// counts as a styled raw tag, and the per-framework file predicates. parseFile itself
// needs @babel/parser / parse5 resolved from the *target* project, so it is exercised
// against a real project, not here — these cover the logic that ships with the plugin.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { arbitraryFrom, isHtmlTag, summarize } from "../plugins/css-drift-auditor/scripts/parsers/shared.mjs";
import react from "../plugins/css-drift-auditor/scripts/parsers/react.mjs";
import angular from "../plugins/css-drift-auditor/scripts/parsers/angular.mjs";
import { DETECT_FRAMEWORK, tmpProject, cleanupTmpProjects, runScript, readJSON, exists } from "./helpers/fixtures.mjs";

after(cleanupTmpProjects);

describe("arbitraryFrom", () => {
  test("extracts Tailwind arbitrary values and dedupes them", () => {
    assert.deepEqual(
      arbitraryFrom("bg-[#2e3440] text-[13px] p-4 bg-[#2e3440]"),
      ["bg-[#2e3440]", "text-[13px]"],
    );
  });

  test("reads through a non-literal className expression", () => {
    assert.deepEqual(arbitraryFrom({ expr: "gap-[7px]" }), ["gap-[7px]"]);
  });

  test("returns empty for values that carry no className", () => {
    assert.deepEqual(arbitraryFrom(null), []);
    assert.deepEqual(arbitraryFrom(undefined), []);
    assert.deepEqual(arbitraryFrom({}), []);
    assert.deepEqual(arbitraryFrom("flex items-center"), []);
  });
});

// isHtmlTag is a case-insensitive membership test over intrinsic tag names — it is
// deliberately NOT the component/html decision. React splits on JSX casing before
// consulting it (`<Button>` is a component, `<button>` is a tag); Angular reaches it
// only after known selectors and hyphenation, on template tags where case is
// meaningless. Asserting `isHtmlTag("Button") === false` would encode the wrong
// contract and push the split into the wrong layer.
describe("isHtmlTag", () => {
  test("recognizes intrinsic elements regardless of case", () => {
    assert.equal(isHtmlTag("div"), true);
    assert.equal(isHtmlTag("DIV"), true);
    assert.equal(isHtmlTag("Button"), true, "case-insensitive by design — see the note above");
  });

  test("rejects custom elements and unknown names", () => {
    assert.equal(isHtmlTag("my-widget"), false);
    assert.equal(isHtmlTag("Card"), false);
  });
});

describe("summarize", () => {
  test("counts tags and components across a nested tree", () => {
    const trees = [{
      type: "html", name: "div", children: [
        { type: "component", name: "Card", children: [{ type: "html", name: "span", children: [] }] },
        { type: "html", name: "div", children: [] },
      ],
    }];

    const { htmlTags, components } = summarize(trees);
    assert.equal(htmlTags.div, 2);
    assert.equal(htmlTags.span, 1);
    assert.equal(components.Card, 1);
  });

  test("collects only raw tags that carry their own styling — the drift surface", () => {
    const trees = [{
      type: "html", name: "section", className: "p-[7px]", arbitrary: ["p-[7px]"], loc: "Foo.tsx:3", children: [
        { type: "html", name: "p", children: [] },
        { type: "html", name: "b", inlineStyle: "color: red", children: [] },
      ],
    }];

    const { styledHtmlTags } = summarize(trees);
    assert.deepEqual(styledHtmlTags.map((s) => s.tag), ["section", "b"]);
    assert.equal(styledHtmlTags[0].loc, "Foo.tsx:3");
  });

  test("tolerates empty and childless input", () => {
    assert.deepEqual(summarize([]), { htmlTags: {}, components: {}, styledHtmlTags: [] });
    assert.deepEqual(summarize(undefined).htmlTags, {});
  });
});

describe("parser file predicates", () => {
  test("react claims component files but not tests, specs, or stories", () => {
    assert.equal(react.matches("src/Button.tsx"), true);
    assert.equal(react.matches("src/Button.jsx"), true);
    assert.equal(react.matches("src/Button.test.tsx"), false);
    assert.equal(react.matches("src/Button.spec.tsx"), false);
    assert.equal(react.matches("src/Button.stories.tsx"), false);
    assert.equal(react.matches("src/util.ts"), false);
  });

  test("angular claims component classes but not their specs", () => {
    assert.equal(angular.matches("src/app/card.component.ts"), true);
    assert.equal(angular.matches("src/app/card.component.spec.ts"), false);
    assert.equal(angular.matches("src/app/card.service.ts"), false);
  });
});

describe("detect-framework", () => {
  test("identifies react + its component extensions and package manager", () => {
    const dir = tmpProject({
      "package.json": { name: "app", dependencies: { react: "^18.0.0" } },
      "pnpm-lock.yaml": "",
      "src/": "",
    });

    const { status, stdout } = runScript(DETECT_FRAMEWORK, { cwd: dir });
    assert.equal(status, 0);

    const out = JSON.parse(stdout);
    assert.equal(out.framework, "react");
    assert.equal(out.packageManager, "pnpm");
    assert.ok(out.componentExts.includes(".tsx"));
    assert.deepEqual(out.srcDirs, ["src"]);
  });

  test("identifies angular and only writes framework.json when asked", () => {
    const dir = tmpProject({ "package.json": { name: "app", dependencies: { "@angular/core": "^17.0.0" } } });

    const bare = runScript(DETECT_FRAMEWORK, { cwd: dir });
    assert.equal(JSON.parse(bare.stdout).framework, "angular");
    assert.equal(exists(dir, "design-audit/framework.json"), false, "detection must not write without --write");

    runScript(DETECT_FRAMEWORK, { cwd: dir, args: ["--write"] });
    assert.equal(readJSON(dir, "design-audit/framework.json").framework, "angular");
  });

  test("degrades to a usable result on a project it doesn't recognize", () => {
    const dir = tmpProject({ "package.json": { name: "plain" } });

    const { status, stdout } = runScript(DETECT_FRAMEWORK, { cwd: dir });
    assert.equal(status, 0, "an unknown stack is not an error");
    const out = JSON.parse(stdout);
    assert.equal(out.hasStorybook, false);
    assert.ok(Array.isArray(out.componentExts) && out.componentExts.length > 0);
  });
});
