import assert from "node:assert/strict";
import test from "node:test";

import { prioritizeToolDefinitionsForTurn } from "../../src/agent/toolPriority.js";
import type { FunctionToolDefinition } from "../../src/capabilities/tools/index.js";

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
