import assert from "node:assert/strict";
import test from "node:test";

import { adaptDiscoveredMcpTools, formatMcpToolName } from "../../src/capabilities/mcp/toolAdapter.js";
import { createToolRegistry, createToolSource } from "../../src/capabilities/tools/core/registry.js";
import { createRuntimeToolRegistry } from "../../src/capabilities/tools/core/runtimeRegistry.js";
import type { RegisteredTool } from "../../src/capabilities/tools/core/types.js";
import { createTestRuntimeConfig, makeToolContext } from "../helpers.js";

test("tool registry exposes governed metadata and promotes specialized document tools ahead of generic file reads", () => {
  const registry = createToolRegistry();
  const entries = registry.entries ?? [];

  const writeFileEntry = entries.find((entry) => entry.name === "write_file");
  const mineruPdfEntry = entries.find((entry) => entry.name === "mineru_pdf_read");
  assert(writeFileEntry);
  assert(mineruPdfEntry);

  assert.equal(writeFileEntry.governance.mutation, "write");
  assert.equal(writeFileEntry.governance.changeSignal, "required");
  assert.equal(writeFileEntry.governance.risk, "medium");
  assert.equal(mineruPdfEntry.governance.mutation, "read");
  assert.equal(mineruPdfEntry.governance.specialty, "document");
  assert.equal(mineruPdfEntry.governance.fallbackOnlyInWorkflows.length, 0);

  const names = registry.definitions.map((tool) => tool.function.name);
  assert(names.indexOf("mineru_pdf_read") >= 0);
  assert(names.indexOf("mineru_pdf_read") < names.indexOf("read_file"));
  assert(names.indexOf("run_shell") > names.indexOf("read_file"));
});

test("governance workflow hints do not hide governed tools from the default agent surface", () => {
  const registry = createToolRegistry();
  const names = new Set(registry.definitions.map((tool) => tool.function.name));

  assert.equal(names.has("list_files"), true);
  assert.equal(names.has("find_files"), true);
  assert.equal(names.has("read_file"), true);
  assert.equal(names.has("search_files"), true);
  assert.equal(names.has("run_shell"), true);
  assert.equal(names.has("write_file"), true);
  assert.equal(names.has("edit_file"), true);
  assert.equal(names.has("apply_patch"), true);
});

test("registry fails closed when an included tool omits governance metadata", () => {
  const unsafeTool = {
    definition: {
      type: "function",
      function: {
        name: "unsafe_append",
        description: "Append to a file without governance metadata.",
        parameters: {
          type: "object",
          properties: {},
        },
      },
    },
    async execute() {
      return {
        ok: true,
        output: "ok",
      };
    },
  } satisfies RegisteredTool;

  assert.throws(
    () => createToolRegistry( {
      onlyNames: ["unsafe_append"],
      sources: [createToolSource("host", "tests.unsafe", [unsafeTool])],
    }),
    /tool governance/i,
  );
});

test("runtime registry governs MCP tools and blocks ambiguous tools that are missing safe metadata", async () => {
  const runtimeConfig = createTestRuntimeConfig(process.cwd());
  const safeToolName = formatMcpToolName("planner", "summarize");
  const blockedToolName = formatMcpToolName("planner", "apply_update");
  const registry = await createRuntimeToolRegistry(
    {
      ...runtimeConfig,
      mcp: {
        enabled: true,
        playwright: {
          ...runtimeConfig.mcp.playwright,
          enabled: true,
        },
        servers: [],
      },
    },
    {},
    {
      collectMcpSources: async () => [createToolSource("mcp", "mcp:planner", adaptDiscoveredMcpTools([
        {
          serverName: "planner",
          name: "summarize",
          description: "Summarize the provided content.",
          readOnly: true,
          inputSchema: {
            type: "object",
            properties: {
              text: { type: "string" },
            },
            required: ["text"],
          },
          async invoke(input) {
            return {
              ok: true,
              output: `summary:${String(input.text ?? "")}`,
            };
          },
        },
        {
          serverName: "planner",
          name: "apply_update",
          description: "Apply an external update.",
          inputSchema: {
            type: "object",
            properties: {
              value: { type: "string" },
            },
          },
          async invoke(input) {
            return {
              ok: true,
              output: `updated:${String(input.value ?? "")}`,
            };
          },
        },
      ]))],
      close: async () => undefined,
    },
  );

  assert((registry.entries ?? []).some((entry) => entry.name === safeToolName && entry.governance.source === "mcp"));
  assert.equal(registry.definitions.some((tool) => tool.function.name === safeToolName), true);
  assert.equal(registry.definitions.some((tool) => tool.function.name === blockedToolName), false);
  assert.match(JSON.stringify(registry.blocked ?? []), /apply_update/);
  assert.match(JSON.stringify(registry.blocked ?? []), /readOnly|governance|fail-closed/i);
});

test("tool execution fails closed when a governed write tool omits required change signals", async () => {
  const governedWriteTool = {
    definition: {
      type: "function",
      function: {
        name: "governed_write",
        description: "A write tool that should emit changedPaths metadata.",
        parameters: {
          type: "object",
          properties: {},
        },
      },
    },
    governance: {
      source: "builtin",
      specialty: "filesystem",
      mutation: "write",
      risk: "medium",
      destructive: false,
      concurrencySafe: false,
      changeSignal: "required",
      verificationSignal: "none",
      preferredWorkflows: [],
      fallbackOnlyInWorkflows: [],
    },
    async execute() {
      return {
        ok: true,
        output: "wrote without metadata",
      };
    },
  } satisfies RegisteredTool;

  const registry = createToolRegistry( {
    onlyNames: ["governed_write"],
    sources: [createToolSource("host", "tests.write", [governedWriteTool])],
  });

  await assert.rejects(
    () => registry.execute("governed_write", "{}", makeToolContext(process.cwd()) as never),
    /CHANGE_SIGNAL_REQUIRED|changedPaths/i,
  );
});
