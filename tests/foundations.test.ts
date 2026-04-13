import assert from "node:assert/strict";
import test from "node:test";

import { getDefaultConfig } from "../src/config/store.js";
import { getSubagentProfile, resolveSubagentMode } from "../src/subagent/profiles.js";
import { createToolRegistry } from "../src/tools/registry.js";
import { handleLocalCommand, isExplicitExitCommand } from "../src/ui/localCommands.js";

test("agent and read-only registries expose the right core tools", () => {
  const agentNames = new Set(createToolRegistry("agent").definitions.map((tool) => tool.function.name));
  const readOnlyNames = new Set(createToolRegistry("read-only").definitions.map((tool) => tool.function.name));

  assert(agentNames.has("write_file"));
  assert(agentNames.has("spawn_teammate"));
  assert(agentNames.has("coordination_policy"));

  assert(readOnlyNames.has("todo_write"));
  assert(readOnlyNames.has("load_skill"));
  assert.equal(readOnlyNames.has("write_file"), false);
  assert.equal(readOnlyNames.has("spawn_teammate"), false);
  assert.equal(readOnlyNames.has("coordination_policy"), false);
});

test("subagent profiles stay isolated from coordination tools", () => {
  const codeProfile = getSubagentProfile("code");
  const exploreProfile = getSubagentProfile("explore");

  assert(codeProfile.toolNames.includes("write_file"));
  assert.equal(codeProfile.toolNames.includes("spawn_teammate"), false);
  assert.equal(codeProfile.toolNames.includes("send_message"), false);
  assert.equal(codeProfile.toolNames.includes("coordination_policy"), false);
  assert.equal(codeProfile.toolNames.includes("task"), false);

  assert.equal(exploreProfile.toolNames.includes("write_file"), false);
  assert.equal(resolveSubagentMode(exploreProfile, "read-only"), "read-only");
  assert.throws(() => resolveSubagentMode(codeProfile, "read-only"), /requires agent mode/i);
});

test("default config starts in agent mode", () => {
  assert.equal(getDefaultConfig().mode, "agent");
  assert.equal(getDefaultConfig().yieldAfterToolSteps, 12);
});

test("local command layer recognizes Chinese aliases and multiline command", async () => {
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
      model: "deepseek-reasoner",
      mode: "agent",
      baseUrl: "https://api.deepseek.com",
    },
  } as any;

  assert.equal(isExplicitExitCommand("/退出"), true);
  assert.equal(await handleLocalCommand("/多行", context), "multiline");
  assert.equal(await handleLocalCommand("/帮助", context), "handled");
});
