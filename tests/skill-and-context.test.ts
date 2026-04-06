import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { buildRequestContext } from "../src/agent/contextBuilder.js";
import { createMessage } from "../src/agent/messages.js";
import { discoverSkills } from "../src/skills/catalog.js";
import { loadSkillTool } from "../src/tools/skills/loadSkillTool.js";
import { createTempWorkspace, makeToolContext } from "./helpers.js";

test("discoverSkills + load_skill load skill bodies on demand", async (t) => {
  const root = await createTempWorkspace("skills", t);
  const skillDir = path.join(root, "skills", "demo-skill");
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      "schema_version: skill.v1",
      "name: demo-skill",
      "description: Demo skill for tests",
      "load_mode: required",
      "trigger_keywords: demo,skill",
      "---",
      "# Demo Skill",
      "Use this specialized workflow.",
    ].join("\n"),
    "utf8",
  );

  const skills = await discoverSkills(root, root, []);
  assert.equal(skills.length, 1);
  assert.equal(skills[0]?.name, "demo-skill");
  assert.equal(skills[0]?.loadMode, "required");

  const output = await loadSkillTool.execute(
    JSON.stringify({ name: "demo-skill" }),
    makeToolContext(root, root, {
      projectContext: {
        stateRootDir: root,
        skills,
      },
    }) as any,
  );

  assert.equal(output.ok, true);
  assert.match(output.output, /"name": "demo-skill"/);
  assert.match(output.output, /Use this specialized workflow\./);
});

test("buildRequestContext compresses oversized histories with a summary", () => {
  const messages = Array.from({ length: 40 }, (_, index) => {
    const body = `${index} `.repeat(300);
    return index % 2 === 0
      ? createMessage("user", `user-${body}`)
      : createMessage("assistant", `assistant-${body}`);
  });

  const built = buildRequestContext("system", messages, {
    contextWindowMessages: 30,
    model: "deepseek-reasoner",
    maxContextChars: 8_000,
    contextSummaryChars: 1_200,
  });

  assert.equal(built.compressed, true);
  assert.ok(built.summary);
  assert.ok(built.messages.length < messages.length + 1);
  assert.ok(built.estimatedChars > 0);
});

test("buildRequestContext keeps the latest tool boundary intact when histories are compressed", () => {
  const messages = Array.from({ length: 24 }, (_, index) =>
    index % 3 === 0
      ? createMessage("user", `user-${index} ${"x".repeat(600)}`)
      : index % 3 === 1
        ? createMessage("assistant", null, {
            toolCalls: [
              {
                id: `tool-${index}`,
                type: "function",
                function: {
                  name: "task_list",
                  arguments: "{}",
                },
              },
            ],
          })
        : createMessage("tool", JSON.stringify({ ok: true, preview: "compressed" }), {
            name: "task_list",
          }),
  );

  const built = buildRequestContext("system", messages, {
    contextWindowMessages: 18,
    model: "deepseek-reasoner",
    maxContextChars: 6_000,
    contextSummaryChars: 900,
  });

  assert.equal(built.compressed, true);
  assert.equal(built.messages.at(-1)?.role, "tool");
  assert.equal(built.messages.at(-2)?.role, "assistant");
});
