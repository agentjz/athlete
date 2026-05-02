import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { discoverSkills } from "../../src/capabilities/skills/discovery.js";
import { loadSkillTool } from "../../src/capabilities/tools/packages/skills/loadSkillTool.js";
import { makeToolContext } from "../helpers.js";

test("repo skill catalog includes web-research", async () => {
  const root = process.cwd();
  const skills = await discoverSkills(root, root, []);
  const names = new Set(skills.map((skill) => skill.name));

  assert.equal(names.has("web-research"), true);
});

test("load_skill can load the repo web research workflow on demand", async () => {
  const root = process.cwd();
  const skills = await discoverSkills(root, root, []);

  const webResearch = await loadSkillTool.execute(
    JSON.stringify({ name: "web-research" }),
    makeToolContext(root, root, {
      projectContext: {
        stateRootDir: path.join(root, ".kitty"),
        skills,
      },
    }) as any,
  );
  assert.equal(webResearch.ok, true);
  assert.match(webResearch.output, /"name": "web-research"/);
  assert.match(webResearch.output, /http_probe/);
});
