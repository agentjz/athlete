import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { discoverSkills } from "../src/skills/discovery.js";
import { createTempWorkspace } from "./helpers.js";

async function writeSkill(root: string, relativePath: string, metadata: string[], body: string[]): Promise<void> {
  const targetPath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(
    targetPath,
    ["---", ...metadata, "---", ...body].join("\n"),
    "utf8",
  );
}

test("discoverSkills keeps supported skill locations while returning normalized V1 entries", async (t) => {
  const root = await createTempWorkspace("skill-discovery", t);
  const cwd = path.join(root, "packages", "app");
  await fs.mkdir(cwd, { recursive: true });

  await writeSkill(
    root,
    "SKILL.md",
    [
      "schema_version: skill.v1",
      "name: root-standalone",
      "description: Root standalone skill",
      "load_mode: manual",
    ],
    ["Standalone body"],
  );
  await writeSkill(
    root,
    "skills/root-visible/SKILL.md",
    [
      "schema_version: skill.v1",
      "name: root-visible",
      "description: Visible root skill",
      "load_mode: suggested",
      "trigger_keywords: repo",
    ],
    ["Root body"],
  );
  await writeSkill(
    root,
    ".skills/root-hidden/SKILL.md",
    [
      "schema_version: skill.v1",
      "name: root-hidden",
      "description: Hidden root skill",
      "load_mode: suggested",
      "trigger_keywords: hidden",
    ],
    ["Hidden body"],
  );
  await writeSkill(
    cwd,
    "skills/local-app/SKILL.md",
    [
      "schema_version: skill.v1",
      "name: local-app",
      "description: Local app skill",
      "load_mode: required",
      "trigger_keywords: app",
    ],
    ["App body"],
  );

  const skills = await discoverSkills(root, cwd, []);
  assert.deepEqual(skills.map((skill) => skill.name), [
    "local-app",
    "root-hidden",
    "root-standalone",
    "root-visible",
  ]);
  assert.equal(skills.every((skill) => skill.schemaVersion === "skill.v1"), true);
});

test("discoverSkills fails clearly when duplicate skill names are discovered", async (t) => {
  const root = await createTempWorkspace("skill-duplicate", t);

  await writeSkill(
    root,
    "skills/alpha/SKILL.md",
    [
      "schema_version: skill.v1",
      "name: shared-name",
      "description: Alpha",
      "load_mode: suggested",
    ],
    ["Alpha body"],
  );
  await writeSkill(
    root,
    ".skills/beta/SKILL.md",
    [
      "schema_version: skill.v1",
      "name: shared-name",
      "description: Beta",
      "load_mode: suggested",
    ],
    ["Beta body"],
  );

  await assert.rejects(() => discoverSkills(root, root, []), /duplicate skill name.*shared-name/i);
});

test("discoverSkills fails clearly when a skill file has invalid metadata", async (t) => {
  const root = await createTempWorkspace("skill-broken", t);

  await writeSkill(
    root,
    "skills/broken/SKILL.md",
    [
      "schema_version: skill.v1",
      "name: broken-skill",
      "description: Broken",
      "load_mode: impossible",
    ],
    ["Broken body"],
  );

  await assert.rejects(() => discoverSkills(root, root, []), /broken-skill|load_mode/i);
});
