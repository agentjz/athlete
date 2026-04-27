import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { discoverSkills } from "../../src/capabilities/skills/discovery.js";
import { loadSkillTool } from "../../src/capabilities/tools/packages/skills/loadSkillTool.js";
import { makeToolContext } from "../helpers.js";

test("repo skill catalog includes web-research and browser-automation workflow skills", async () => {
  const root = process.cwd();
  const skills = await discoverSkills(root, root, []);
  const names = new Set(skills.map((skill) => skill.name));

  assert.equal(names.has("web-research"), true);
  assert.equal(names.has("browser-automation"), true);
});

test("load_skill can load the repo web workflow skills on demand", async () => {
  const root = process.cwd();
  const skills = await discoverSkills(root, root, []);

  const webResearch = await loadSkillTool.execute(
    JSON.stringify({ name: "web-research" }),
    makeToolContext(root, root, {
      projectContext: {
        stateRootDir: path.join(root, ".deadmouse"),
        skills,
      },
    }) as any,
  );
  const browserAutomation = await loadSkillTool.execute(
    JSON.stringify({ name: "browser-automation" }),
    makeToolContext(root, root, {
      projectContext: {
        stateRootDir: path.join(root, ".deadmouse"),
        skills,
      },
    }) as any,
  );

  assert.equal(webResearch.ok, true);
  assert.equal(browserAutomation.ok, true);
  assert.match(webResearch.output, /"name": "web-research"/);
  assert.match(browserAutomation.output, /"name": "browser-automation"/);
  assert.match(webResearch.output, /mcp_playwright_browser_navigate|browser_navigate/i);
  assert.match(browserAutomation.output, /mcp_playwright_browser_click|browser_click/i);
});
