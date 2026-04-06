import assert from "node:assert/strict";
import test from "node:test";

import { prioritizeToolDefinitionsForTurn } from "../src/agent/toolPriority.js";
import type { FunctionToolDefinition } from "../src/tools/index.js";

function createTool(name: string): FunctionToolDefinition {
  return {
    type: "function",
    function: {
      name,
      description: name,
      parameters: {
        type: "object",
        properties: {},
      },
    },
  };
}

test("prioritizeToolDefinitionsForTurn prefers load_skill and Playwright browser tools for natural-language web research", () => {
  const prioritized = prioritizeToolDefinitionsForTurn(
    [
      createTool("list_files"),
      createTool("read_file"),
      createTool("run_shell"),
      createTool("load_skill"),
      createTool("mcp_playwright_browser_navigate"),
      createTool("mcp_playwright_browser_snapshot"),
      createTool("mcp_playwright_browser_click"),
      createTool("mcp_playwright_browser_type"),
      createTool("write_file"),
    ],
    {
      input: "Please look up the latest public Helldivers 2 news on the web, summarize it in five bullets or fewer, and write it to a document.",
      missingRequiredSkillNames: ["web-research"],
    },
  );

  const names = prioritized.map((tool) => tool.function.name);
  assert.deepEqual(names.slice(0, 3), [
    "load_skill",
    "mcp_playwright_browser_navigate",
    "mcp_playwright_browser_snapshot",
  ]);
  assert(names.indexOf("mcp_playwright_browser_click") < names.indexOf("list_files"));
  assert(names.indexOf("mcp_playwright_browser_type") < names.indexOf("read_file"));
  assert(names.indexOf("run_shell") > names.indexOf("write_file"));
});

test("prioritizeToolDefinitionsForTurn keeps Playwright browser tools first across continuation-style resume prompts", () => {
  const prioritized = prioritizeToolDefinitionsForTurn(
    [
      createTool("list_files"),
      createTool("read_file"),
      createTool("run_shell"),
      createTool("mcp_playwright_browser_navigate"),
      createTool("mcp_playwright_browser_snapshot"),
      createTool("mcp_playwright_browser_take_screenshot"),
      createTool("write_file"),
    ],
    {
      input: "[internal] Resume the current task from the latest progress. Continue without restarting.",
      objective: "Research the latest public Helldivers 2 news from the web and summarize it.",
      taskSummary: "[>] browse official and news webpages, then write validation/helldivers2-latest.md",
      missingRequiredSkillNames: [],
    },
  );

  const names = prioritized.map((tool) => tool.function.name);
  assert.deepEqual(names.slice(0, 3), [
    "mcp_playwright_browser_navigate",
    "mcp_playwright_browser_snapshot",
    "mcp_playwright_browser_take_screenshot",
  ]);
  assert(names.indexOf("mcp_playwright_browser_snapshot") < names.indexOf("list_files"));
  assert(names.indexOf("mcp_playwright_browser_take_screenshot") < names.indexOf("run_shell"));
});

test("prioritizeToolDefinitionsForTurn leaves non-web turns in their original order", () => {
  const original = [
    createTool("list_files"),
    createTool("read_file"),
    createTool("run_shell"),
    createTool("mcp_playwright_browser_navigate"),
  ];

  const prioritized = prioritizeToolDefinitionsForTurn(original, {
    input: "Inspect the src directory structure and summarize the current module boundaries.",
    missingRequiredSkillNames: [],
  });

  assert.deepEqual(
    prioritized.map((tool) => tool.function.name),
    original.map((tool) => tool.function.name),
  );
});
