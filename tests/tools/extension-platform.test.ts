import assert from "node:assert/strict";
import test from "node:test";

import { createHostToolRegistry } from "../../src/host/toolRegistry.js";
import { McpClientManager } from "../../src/capabilities/mcp/clientManager.js";
import { normalizeMcpConfig } from "../../src/capabilities/mcp/config.js";
import { collectMcpToolSources } from "../../src/capabilities/mcp/registryIntegration.js";
import type { McpClient } from "../../src/capabilities/mcp/types.js";
import { createToolRegistry, createToolSource } from "../../src/capabilities/tools/core/registry.js";
import type { RegisteredTool, ToolRegistrySource } from "../../src/capabilities/tools/core/types.js";
import { createTestRuntimeConfig, makeToolContext } from "../helpers.js";

test("a formally described extension source can register a new governed tool without editing shared registry wiring", async () => {
  const registry = createToolRegistry( {
    onlyNames: ["project_echo"],
    sources: [
      createToolSource("host", "tests.project-echo", [
        createGovernedTool(
          "project_echo",
          async (rawArgs) => ({
            ok: true,
            output: `echo:${rawArgs}`,
          }),
          {
            type: "object",
            properties: {
              text: {
                type: "string",
              },
            },
            required: ["text"],
            additionalProperties: false,
          },
        ),
      ]),
    ],
  });

  const result = await registry.execute(
    "project_echo",
    JSON.stringify({ text: "hello" }),
    makeToolContext(process.cwd()) as never,
  );

  assert.equal(result.ok, true);
  assert.equal(result.output, 'echo:{"text":"hello"}');
});

test("duplicate tool names across extension sources fail at the registration boundary instead of silently overriding", () => {
  const duplicate = createGovernedTool("duplicate_tool", async () => ({
    ok: true,
    output: "ok",
  }));

  const sources: ToolRegistrySource[] = [
    createToolSource("host", "tests.host.one", [duplicate]),
    createToolSource("mcp", "tests.mcp.two", [duplicate]),
  ];

  assert.throws(
    () => createToolRegistry( { sources }),
    /duplicate tool registration|duplicate_tool/i,
  );
});

test("host tool injection stamps extra tools as host-governed extensions instead of builtin tools", async () => {
  const registry = await createHostToolRegistry(createTestRuntimeConfig(process.cwd()), {
    extraTools: [
      createGovernedTool("host_delivery", async () => ({
        ok: true,
        output: "sent",
      })),
    ],
  });

  const entry = registry.entries?.find((item) => item.name === "host_delivery");
  assert(entry);
  assert.equal(entry.origin.kind, "host");
  assert.equal(entry.governance.source, "host");
});

test("MCP registry integration exposes one formal source per server before entering the shared registry pipeline", async () => {
  const config = normalizeMcpConfig({
    enabled: true,
    servers: [
      {
        name: "planner",
        transport: "stdio",
        command: "node",
      },
    ],
  });

  const manager = new McpClientManager(config, (server): McpClient => ({
    server,
    async discover() {
      return {
        server,
        status: "ready",
        tools: [
          {
            serverName: "planner",
            name: "summarize",
            description: "Summarize content.",
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
        ],
        instructions: [],
        diagnostics: [],
        updatedAt: new Date().toISOString(),
      };
    },
    async close() {
      return;
    },
  }));

  const sources = await collectMcpToolSources(config, manager);
  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.kind, "mcp");
  assert.equal(sources[0]?.id, "mcp:planner");
  assert.equal(sources[0]?.tools[0]?.governance?.source, "mcp");
});

function createGovernedTool(
  name: string,
  execute: RegisteredTool["execute"],
  parameters?: Record<string, unknown>,
): RegisteredTool {
  return {
    definition: {
      type: "function",
      function: {
        name,
        description: `${name} test tool`,
        parameters: parameters ?? {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    },
    governance: {
      specialty: "external",
      mutation: "state",
      risk: "medium",
      destructive: false,
      concurrencySafe: false,
      changeSignal: "none",
      verificationSignal: "none",
      preferredWorkflows: [],
      fallbackOnlyInWorkflows: [],
    },
    execute,
  };
}
