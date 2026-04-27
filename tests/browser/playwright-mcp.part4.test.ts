import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { getDefaultConfig, resolveRuntimeConfig } from "../../src/config/store.js";
import { McpClientManager } from "../../src/capabilities/mcp/clientManager.js";
import { normalizeMcpConfig, resolveMcpServerDefinitions } from "../../src/capabilities/mcp/config.js";
import { getDefaultPlaywrightMcpConfig } from "../../src/capabilities/mcp/playwright/config.js";
import { normalizePlaywrightToolInput } from "../../src/capabilities/mcp/playwright/invoke.js";
import { adaptDiscoveredMcpTools, formatMcpToolName } from "../../src/capabilities/mcp/toolAdapter.js";
import { buildTeammateWorkerEnv } from "../../src/capabilities/team/spawn.js";
import { createToolSource } from "../../src/capabilities/tools/core/registry.js";
import { createRuntimeToolRegistry } from "../../src/capabilities/tools/core/runtimeRegistry.js";
import { createTempWorkspace, createTestRuntimeConfig, makeToolContext } from "../helpers.js";

test("agent-visible runtime tool definitions include Playwright MCP browser tools", async () => {
  const toolName = formatMcpToolName("playwright", "browser_navigate");
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
            },
            async invoke(input) {
              return {
                ok: true,
                output: `visited:${String(input.url ?? "")}`,
              };
            },
          },
        ]))],
      close: async () => undefined,
    },
  );

  const definition = registry.definitions.find((tool: any) => tool.function.name === toolName);
  assert(definition);
  assert.match(definition.function.description ?? "", /MCP server: playwright/i);
});

test("runtime registry keeps Playwright browser tools visible without making them default-first tools", async () => {
  const navigateToolName = formatMcpToolName("playwright", "browser_navigate");
  const snapshotToolName = formatMcpToolName("playwright", "browser_snapshot");
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
            },
            async invoke() {
              return {
                ok: true,
                output: "ok",
              };
            },
          },
          {
            serverName: "playwright",
            name: "browser_snapshot",
            description: "Capture an accessibility snapshot of the current page.",
            inputSchema: {
              type: "object",
              properties: {},
            },
            async invoke() {
              return {
                ok: true,
                output: "ok",
              };
            },
          },
        ]))],
      close: async () => undefined,
    },
  );

  const names = registry.definitions.map((tool: any) => tool.function.name);
  assert(names.indexOf(navigateToolName) >= 0);
  assert(names.indexOf(snapshotToolName) >= 0);
  assert(names.indexOf("list_files") < names.indexOf(navigateToolName));
  assert(names.indexOf("read_file") < names.indexOf(snapshotToolName));
  assert(names.indexOf("http_request") < names.indexOf(navigateToolName));
});
