import assert from "node:assert/strict";
import test from "node:test";

import { createMessage, createToolMessage } from "../src/agent/session.js";
import { prioritizeToolDefinitionsForTurn } from "../src/agent/toolPriority.js";
import { getWorkflowToolGateResult } from "../src/skills/workflowGuards.js";
import type { FunctionToolDefinition } from "../src/tools/index.js";
import type { SkillRuntimeState } from "../src/types.js";

function createTool(name: string, description = name): FunctionToolDefinition {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties: {},
      },
    },
  };
}

function createRuntimeState(loadedSkillNames: string[]): SkillRuntimeState {
  return {
    matches: [],
    namedSkills: [],
    applicableSkills: [],
    suggestedSkills: [],
    requiredSkills: [],
    missingRequiredSkills: [],
    loadedSkills: [],
    loadedSkillNames: new Set(loadedSkillNames),
  };
}

test("workflow guard does not block shell web fetching while preserving Playwright-independent naming", () => {
  const blocked = getWorkflowToolGateResult(
    "run_shell",
    JSON.stringify({ command: "curl https://example.com -o page.html" }),
    {
      messages: [createMessage("user", "Research the latest public Helldivers 2 news on the web.")],
    },
    createRuntimeState(["web-research"]),
  );

  assert.equal(blocked, null);
});

test("workflow guard does not block shell web fetching after non-Playwright browser progress", () => {
  const blocked = getWorkflowToolGateResult(
    "run_shell",
    JSON.stringify({ command: "curl https://example.com -o page.html" }),
    {
      messages: [
        createMessage("user", "Research the latest public Helldivers 2 news on the web."),
        createToolMessage("call-1", "Page URL: https://example.com", "mcp_webpilot_browser_navigate"),
      ],
    },
    createRuntimeState(["web-research"]),
  );

  assert.equal(blocked, null);
});

test("tool priority recognizes browser capability tools without depending on Playwright naming", () => {
  const prioritized = prioritizeToolDefinitionsForTurn(
    [
      createTool("list_files"),
      createTool("read_file"),
      createTool("run_shell"),
      createTool("mcp_webpilot_browser_navigate", "Browser navigate step"),
      createTool("mcp_webpilot_browser_snapshot", "Browser snapshot step"),
      createTool("mcp_webpilot_browser_click", "Browser click step"),
      createTool("write_file"),
    ],
    {
      input: "Open the website, inspect the live page in the browser, then summarize the latest public news.",
      missingRequiredSkillNames: [],
    },
  );

  const names = prioritized.map((tool) => tool.function.name);
  assert.deepEqual(names.slice(0, 2), [
    "mcp_webpilot_browser_navigate",
    "mcp_webpilot_browser_snapshot",
  ]);
  assert(names.indexOf("mcp_webpilot_browser_click") < names.indexOf("list_files"));
  assert(names.indexOf("run_shell") > names.indexOf("write_file"));
});
