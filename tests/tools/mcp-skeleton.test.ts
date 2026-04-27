import assert from "node:assert/strict";
import test from "node:test";

import { McpClientManager } from "../../src/mcp/clientManager.js";
import { normalizeMcpConfig } from "../../src/mcp/config.js";
import { createPlaceholderMcpClient } from "../../src/mcp/discovery.js";
import { collectMcpToolSources } from "../../src/mcp/registryIntegration.js";
import { adaptDiscoveredMcpTools, formatMcpToolName } from "../../src/mcp/toolAdapter.js";
import type { McpClient, McpDiscoveredTool } from "../../src/mcp/types.js";
import { createToolRegistry, createToolSource } from "../../src/tools/registry.js";
import { makeToolContext } from "../helpers.js";

test("McpClientManager can still expose placeholder discovery snapshots when an explicit placeholder client factory is used", async () => {
  const config = normalizeMcpConfig({
    enabled: true,
    servers: [
      {
        name: "demo",
        transport: "stdio",
        command: "node",
      },
    ],
  });

  const manager = new McpClientManager(config, createPlaceholderMcpClient);
  const snapshots = await manager.refresh();

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0]?.status, "not_implemented");
  assert.match(String(snapshots[0]?.diagnostics[0] ?? ""), /not connected yet/i);
});

test("MCP tool adapter produces RegisteredTool objects compatible with the tool registry", async () => {
  const tools = adaptDiscoveredMcpTools([
    {
      serverName: "demo",
      name: "echo",
      description: "Echo the provided text.",
      readOnly: true,
      inputSchema: {
        type: "object",
        properties: {
          value: {
            type: "string",
          },
        },
        required: ["value"],
      },
      async invoke(input) {
        return {
          ok: true,
          output: `echo:${String(input.value ?? "")}`,
        };
      },
    },
  ]);

  const registry = createToolRegistry( {
    sources: [createToolSource("mcp", "mcp:demo", tools)],
  });
  const toolName = formatMcpToolName("demo", "echo");

  assert(registry.definitions.some((tool) => tool.function.name === toolName));

  const result = await registry.execute(toolName, JSON.stringify({ value: "hi" }), makeToolContext(process.cwd()) as any);
  assert.equal(result.ok, true);
  assert.equal(result.output, "echo:hi");
});

test("registry integration can turn discovered MCP tools into formal sources without bypassing the core registry", async () => {
  const discoveredTool: McpDiscoveredTool = {
    serverName: "planner",
    name: "summarize",
    description: "Summarize input.",
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
  };

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
        tools: [discoveredTool],
        instructions: ["Future MCP server instructions will land here."],
        diagnostics: [],
        updatedAt: new Date().toISOString(),
      };
    },
    async close() {
      return;
    },
  }));

  const sources = await collectMcpToolSources(config, manager);
  const registry = createToolRegistry( {
    sources,
  });

  const result = await registry.execute(
    formatMcpToolName("planner", "summarize"),
    JSON.stringify({ text: "roadmap" }),
    makeToolContext(process.cwd()) as any,
  );

  assert.equal(result.output, "summary:roadmap");
});
