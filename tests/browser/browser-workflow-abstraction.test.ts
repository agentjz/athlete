import assert from "node:assert/strict";
import test from "node:test";

import { orderToolDefinitionsForLead } from "../../src/agent/capabilityPresentation.js";
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

test("tool presentation order recognizes browser capability tools without depending on provider naming", () => {
  const ordered = orderToolDefinitionsForLead(
    [
      createTool("read"),
      createTool("bash"),
      createTool("mcp_webpilot_browser_navigate", "Browser navigate step"),
      createTool("mcp_webpilot_browser_snapshot", "Browser snapshot step"),
      createTool("mcp_webpilot_browser_click", "Browser click step"),
      createTool("write"),
    ],
    {
      input: "Open the website, inspect the live page in the browser, then summarize the latest public news.",
    },
  );

  const names = ordered.map((tool) => tool.function.name);
  assert.deepEqual(names.slice(0, 2), [
    "mcp_webpilot_browser_navigate",
    "mcp_webpilot_browser_snapshot",
  ]);
  assert(names.indexOf("mcp_webpilot_browser_click") < names.indexOf("read"));
  assert(names.indexOf("bash") > names.indexOf("write"));
});

