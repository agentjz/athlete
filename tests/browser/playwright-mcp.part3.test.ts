import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { getDefaultConfig, resolveRuntimeConfig } from "../../src/config/store.js";
import { McpClientManager } from "../../src/mcp/clientManager.js";
import { normalizeMcpConfig, resolveMcpServerDefinitions } from "../../src/mcp/config.js";
import { getDefaultPlaywrightMcpConfig } from "../../src/mcp/playwright/config.js";
import { normalizePlaywrightToolInput } from "../../src/mcp/playwright/invoke.js";
import { adaptDiscoveredMcpTools, formatMcpToolName } from "../../src/mcp/toolAdapter.js";
import { buildTeammateWorkerEnv } from "../../src/team/spawn.js";
import { createToolSource } from "../../src/tools/registry.js";
import { createRuntimeToolRegistry } from "../../src/tools/runtimeRegistry.js";
import { createTempWorkspace, createTestRuntimeConfig, makeToolContext } from "../helpers.js";

test("McpClientManager keeps discovered MCP tools callable until the manager is explicitly closed", async () => {
  const config = normalizeMcpConfig({
    enabled: true,
    servers: [
      {
        name: "playwright",
        transport: "stdio",
        command: "npx",
        args: ["@playwright/mcp@latest"],
      },
    ],
  });

  let closeCalls = 0;
  let closed = false;
  const manager = new McpClientManager(config, (server) => ({
    server,
    async discover() {
      return {
        server,
        status: "ready",
        tools: [
          {
            serverName: "playwright",
            name: "browser_navigate",
            description: "Navigate the browser to a URL.",
            inputSchema: {
              type: "object",
              properties: {
                url: { type: "string" },
              },
              required: ["url"],
            },
            async invoke(input) {
              return {
                ok: !closed,
                output: closed ? "client closed" : `navigated:${String(input.url ?? "")}`,
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
      closed = true;
      closeCalls += 1;
    },
  }));

  await manager.refresh();
  const tool = manager.getDiscoveredTools()[0];
  assert(tool);

  const result = await tool.invoke({ url: "https://playwright.dev" }, {});
  assert.equal(result.output, "navigated:https://playwright.dev");
  assert.equal(closeCalls, 0);
  assert.equal(typeof (manager as any).close, "function");

  await (manager as any).close();
  assert.equal(closeCalls, 1);
});

test("runtime registry exposes Playwright MCP tool definitions without eager MCP discovery", async () => {
  const toolName = formatMcpToolName("playwright", "browser_navigate");
  let refreshCalls = 0;

  const manager = {
    async refresh() {
      refreshCalls += 1;
      return [];
    },
    getDiscoveredTools() {
      return [];
    },
    getSnapshots() {
      return [];
    },
    async close() {
      return;
    },
  };

  const registry = await (createRuntimeToolRegistry as any)(
    {
      ...createTestRuntimeConfig(process.cwd()),
      mcp: {
        enabled: true,
        playwright: {
          enabled: true,
        },
        servers: [],
      },
    },
    {},
    {
      manager,
    },
  );

  const names = new Set(registry.definitions.map((tool: any) => tool.function.name));
  assert(names.has("read_file"));
  assert(names.has(toolName));
  assert.equal(refreshCalls, 0);

  await registry.close();
  assert.equal(refreshCalls, 0);
});

test("runtime registry starts Playwright MCP only when a browser tool is executed", async () => {
  const toolName = formatMcpToolName("playwright", "browser_navigate");
  let refreshCalls = 0;
  let invokeCalls = 0;

  const manager = {
    async refresh() {
      refreshCalls += 1;
      return [];
    },
    getDiscoveredTools() {
      return [
        {
          serverName: "playwright",
          name: "browser_navigate",
          description: "Navigate the browser to a URL.",
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string" },
            },
            required: ["url"],
          },
          async invoke(input: Record<string, unknown>) {
            invokeCalls += 1;
            return {
              ok: true,
              output: `lazy-visited:${String(input.url ?? "")}`,
            };
          },
        },
      ];
    },
    getSnapshots() {
      return [];
    },
    async close() {
      return;
    },
  };

  const registry = await (createRuntimeToolRegistry as any)(
    {
      ...createTestRuntimeConfig(process.cwd()),
      mcp: {
        enabled: true,
        playwright: {
          enabled: true,
        },
        servers: [],
      },
    },
    {},
    {
      manager,
    },
  );

  assert.equal(refreshCalls, 0);
  const result = await registry.execute(
    toolName,
    JSON.stringify({ url: "https://playwright.dev" }),
    makeToolContext(process.cwd()) as any,
  );

  assert.equal(refreshCalls, 1);
  assert.equal(invokeCalls, 1);
  assert.equal(result.output, "lazy-visited:https://playwright.dev");

  await registry.close();
});

test("runtime registry wires Playwright MCP tools through the core registry without dropping built-ins", async () => {
  const toolName = formatMcpToolName("playwright", "browser_navigate");
  let closeCalls = 0;

  const registry = await (createRuntimeToolRegistry as any)(
    {
      ...createTestRuntimeConfig(process.cwd()),
      mcp: {
        enabled: true,
        playwright: {
          enabled: true,
        },
        servers: [],
      },
    },
    {},
    {
      collectMcpSources: async () => [createToolSource("mcp", "mcp:playwright", adaptDiscoveredMcpTools([
          {
            serverName: "playwright",
            name: "browser_navigate",
            description: "Navigate the browser to a URL.",
            inputSchema: {
              type: "object",
              properties: {
                url: { type: "string" },
              },
              required: ["url"],
            },
            async invoke(input) {
              return {
                ok: true,
                output: `visited:${String(input.url ?? "")}`,
              };
            },
          },
        ]))],
      close: async () => {
        closeCalls += 1;
      },
    },
  );

  const names = new Set(registry.definitions.map((tool: any) => tool.function.name));
  assert(names.has("read_file"));
  assert(names.has(toolName));

  const result = await registry.execute(
    toolName,
    JSON.stringify({ url: "https://playwright.dev" }),
    makeToolContext(process.cwd()) as any,
  );

  assert.equal(result.output, "visited:https://playwright.dev");
  assert.equal(typeof registry.close, "function");

  await registry.close();
  assert.equal(closeCalls, 1);
});
