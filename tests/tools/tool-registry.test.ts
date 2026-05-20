import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry, createToolSource } from "../../src/tools/core/registry.js";
import type { RegisteredTool } from "../../src/tools/core/types.js";
import { createToolContext, createTempWorkspace } from "../helpers.js";

test("tool registry rejects duplicate tool names at registry boundary", () => {
  const tool = createHostTool("duplicate_tool");
  assert.throws(
    () => createToolRegistry({
      sources: [
        createToolSource("host", "left", [tool]),
        createToolSource("host", "right", [tool]),
      ],
    }),
    /Duplicate tools/,
  );
});

test("tool registry validates arguments before execution", async (t) => {
  const root = await createTempWorkspace("tool-registry", t);
  const registry = createToolRegistry({
    onlyNames: ["needs_name"],
    sources: [createToolSource("host", "test", [createHostTool("needs_name")])],
  });

  const result = await registry.execute("needs_name", "{}", createToolContext(root));
  assert.equal(result.ok, false);
  assert.equal(JSON.parse(result.output).code, "INVALID_TOOL_ARGUMENTS");
});

function createHostTool(name: string): RegisteredTool {
  return {
    definition: {
      type: "function",
      function: {
        name,
        description: "test tool",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
          required: ["name"],
          additionalProperties: false,
        },
      },
    },
    async execute() {
      return { ok: true, output: "{}" };
    },
  };
}
