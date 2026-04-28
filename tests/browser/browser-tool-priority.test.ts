import assert from "node:assert/strict";
import test from "node:test";

import { buildInternalWakeInput } from "../../src/agent/checkpoint.js";
import { prioritizeToolDefinitionsForTurn } from "../../src/agent/toolPriority.js";
import type { FunctionToolDefinition } from "../../src/capabilities/tools/index.js";

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

test("prioritizeToolDefinitionsForTurn keeps web research lightweight before browser automation", () => {
  const prioritized = prioritizeToolDefinitionsForTurn(
    [
      createTool("list_files"),
      createTool("read_file"),
      createTool("run_shell"),
      createTool("http_probe"),
      createTool("http_request"),
      createTool("download_url"),
      createTool("load_skill"),
      createTool("mcp_playwright_browser_navigate"),
      createTool("mcp_playwright_browser_snapshot"),
      createTool("mcp_playwright_browser_click"),
      createTool("mcp_playwright_browser_type"),
      createTool("write_file"),
    ],
    {
      input: "Please look up the latest public Helldivers 2 news on the web, summarize it in five bullets or fewer, and write it to a document.",
    },
  );

  const names = prioritized.map((tool) => tool.function.name);
  assert(names.indexOf("http_probe") < names.indexOf("mcp_playwright_browser_navigate"));
  assert(names.indexOf("http_request") < names.indexOf("mcp_playwright_browser_snapshot"));
  assert(names.indexOf("download_url") < names.indexOf("mcp_playwright_browser_click"));
  assert(names.includes("load_skill"));
});

test("prioritizeToolDefinitionsForTurn keeps continuation web hints advisory instead of browser-first", () => {
  const prioritized = prioritizeToolDefinitionsForTurn(
    [
      createTool("list_files"),
      createTool("read_file"),
      createTool("run_shell"),
      createTool("http_probe"),
      createTool("http_request"),
      createTool("mcp_playwright_browser_navigate"),
      createTool("mcp_playwright_browser_snapshot"),
      createTool("mcp_playwright_browser_take_screenshot"),
      createTool("write_file"),
    ],
    {
      input: buildInternalWakeInput(undefined),
      objective: "Research the latest public Helldivers 2 news from the web and summarize it.",
      taskSummary: "[>] browse official and news webpages, then write validation/helldivers2-latest.md",
    },
  );

  const names = prioritized.map((tool) => tool.function.name);
  assert(names.indexOf("http_probe") < names.indexOf("mcp_playwright_browser_navigate"));
  assert(names.indexOf("http_request") < names.indexOf("mcp_playwright_browser_snapshot"));
  assert(names.includes("run_shell"));
  assert(names.includes("mcp_playwright_browser_take_screenshot"));
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
  });

  assert.deepEqual(
    prioritized.map((tool) => tool.function.name),
    original.map((tool) => tool.function.name),
  );
});
