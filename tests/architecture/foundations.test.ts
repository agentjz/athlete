import assert from "node:assert/strict";
import test from "node:test";

import { getSubagentProfile } from "../../src/capabilities/subagent/profiles.js";
import { createToolRegistry } from "../../src/capabilities/tools/core/registry.js";
import { handleLocalCommand, isExplicitExitCommand } from "../../src/ui/localCommands.js";
test("agent registry exposes the core tool surface", () => {
  const names = new Set(createToolRegistry({ onlyNames: ["read", "edit", "write", "bash"] }).definitions.map((tool) => tool.function.name));

  assert.deepEqual([...names], ["read", "write", "edit", "bash"]);
  assert(names.has("read"));
  assert(names.has("edit"));
  assert(names.has("write"));
  assert(names.has("bash"));
});

test("subagent profiles stay isolated from coordination tools", () => {
  const codeProfile = getSubagentProfile("code");
  const exploreProfile = getSubagentProfile("explore");

  assert(codeProfile.toolNames.includes("write"));
  assert(codeProfile.toolNames.includes("edit"));
  assert(codeProfile.toolNames.includes("bash"));
  assert.equal(codeProfile.toolNames.includes("spawn_teammate"), false);
  assert.equal(codeProfile.toolNames.includes("send_message"), false);
  assert.equal(codeProfile.toolNames.includes("coordination_policy"), false);
  assert.equal(codeProfile.toolNames.includes("task"), false);

  assert.equal(exploreProfile.toolNames.includes("write"), false);
  assert.equal(exploreProfile.toolNames.includes("edit"), false);
});

test("local command layer recognizes English commands and multiline command", async () => {
  const context = {
    cwd: process.cwd(),
    session: {
      id: "s1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cwd: process.cwd(),
      messageCount: 0,
      messages: [],
      todoItems: [],
    },
    config: {
      model: "deepseek-v4-flash",
      baseUrl: "https://api.deepseek.com",
    },
  } as any;

  assert.equal(isExplicitExitCommand("/exit"), true);
  assert.equal(await handleLocalCommand("/multi", context), "multiline");
  assert.equal(await handleLocalCommand("/help", context), "handled");
});

