import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { getDefaultConfig, resolveRuntimeConfig } from "../src/config/store.js";
import { McpClientManager } from "../src/mcp/clientManager.js";
import { normalizeMcpConfig, resolveMcpServerDefinitions } from "../src/mcp/config.js";
import { getDefaultPlaywrightMcpConfig } from "../src/mcp/playwright/config.js";
import { normalizePlaywrightToolInput } from "../src/mcp/playwright/invoke.js";
import { adaptDiscoveredMcpTools, formatMcpToolName } from "../src/mcp/toolAdapter.js";
import { buildTeammateWorkerEnv } from "../src/team/spawn.js";
import { createRuntimeToolRegistry } from "../src/tools/runtimeRegistry.js";
import { createTempWorkspace, createTestRuntimeConfig, makeToolContext } from "./helpers.js";

test("default config keeps Playwright MCP disabled but headed by default", () => {
  const playwright = (getDefaultConfig().mcp as any).playwright;

  assert.equal(playwright?.enabled, false);
  assert.equal(playwright?.headless, false);
  assert.equal(playwright?.saveSession, true);
});

test("normalizeMcpConfig resolves the official Playwright MCP server in headed mode with an explicit profile path", async (t) => {
  const workspaceRoot = await createTempWorkspace("playwright-config", t);
  const config = (normalizeMcpConfig as any)(
    {
      enabled: true,
      playwright: {
        enabled: true,
      },
    },
    {
      cwd: path.join(workspaceRoot, "workspace"),
      cacheDir: path.join(process.cwd(), ".tmp-playwright-cache"),
    },
  );

  const server = resolveMcpServerDefinitions(config).find((item) => item.name === "playwright");
  assert(server);
  assert.equal(server.transport, "stdio");
  assert.match(server.command, /npx(\.cmd)?$/i);
  assert(server.args.includes("@playwright/mcp@latest"));
  assert.equal(server.args.includes("--headless"), false);

  const userDataDirIndex = server.args.indexOf("--user-data-dir");
  assert.notEqual(userDataDirIndex, -1);

  const userDataDir = server.args[userDataDirIndex + 1];
  assert.equal(typeof userDataDir, "string");
  assert.equal(path.isAbsolute(String(userDataDir)), true);
  assert.match(String(userDataDir).toLowerCase(), /playwright/);
});

test("normalizeMcpConfig routes Playwright MCP artifacts into the project .athlete state directory", async (t) => {
  const stateRootDir = await createTempWorkspace("playwright-state-root", t);
  const config = (normalizeMcpConfig as any)(
    {
      enabled: true,
      playwright: {
        enabled: true,
      },
    },
    {
      cwd: path.join(stateRootDir, "packages", "app"),
      cacheDir: path.join(process.cwd(), ".tmp-playwright-cache"),
      stateRootDir,
    },
  );

  const server = resolveMcpServerDefinitions(config).find((item) => item.name === "playwright");
  assert(server);

  const outputDirIndex = server.args.indexOf("--output-dir");
  const configIndex = server.args.indexOf("--config");
  const userDataDirIndex = server.args.indexOf("--user-data-dir");

  assert.notEqual(outputDirIndex, -1);
  assert.notEqual(configIndex, -1);
  assert.notEqual(userDataDirIndex, -1);
  assert.equal(server.args.includes("--save-session"), true);

  const outputDir = String(server.args[outputDirIndex + 1] ?? "");
  const configPath = String(server.args[configIndex + 1] ?? "");
  const userDataDir = String(server.args[userDataDirIndex + 1] ?? "");

  assert.equal(path.isAbsolute(outputDir), true);
  assert.equal(path.isAbsolute(configPath), true);
  assert.equal(path.isAbsolute(userDataDir), true);
  assert.match(outputDir, /[\\\/]\.athlete[\\\/]playwright-mcp/i);
  assert.match(configPath, /[\\\/]\.athlete[\\\/]playwright-mcp[\\\/]/i);
  assert.match(userDataDir, /[\\\/]\.athlete[\\\/]playwright-mcp[\\\/]/i);
  assert.equal(outputDir.startsWith(path.join(stateRootDir, ".athlete")), true);
  assert.equal(configPath.startsWith(path.join(stateRootDir, ".athlete")), true);
  assert.equal(userDataDir.startsWith(path.join(stateRootDir, ".athlete")), true);
});

test("normalizeMcpConfig only appends --headless when it is explicitly enabled", async (t) => {
  const workspaceRoot = await createTempWorkspace("playwright-headless", t);
  const expectedProfileDir = path.join(workspaceRoot, ".tmp-playwright-profile");
  const config = (normalizeMcpConfig as any)(
    {
      enabled: true,
      playwright: {
        enabled: true,
        headless: true,
        userDataDir: expectedProfileDir,
      },
    },
    {
      cwd: path.join(workspaceRoot, "workspace"),
      cacheDir: path.join(process.cwd(), ".tmp-playwright-cache"),
    },
  );

  const server = resolveMcpServerDefinitions(config).find((item) => item.name === "playwright");
  assert(server);
  assert.equal(server.args.includes("--headless"), true);

  const userDataDirIndex = server.args.indexOf("--user-data-dir");
  assert.equal(server.args[userDataDirIndex + 1], expectedProfileDir);
});

test("normalizePlaywrightToolInput rewrites relative artifact filenames into the Playwright output directory", async (t) => {
  const stateRootDir = await createTempWorkspace("playwright-output-path", t);
  const config = normalizeMcpConfig(
    {
      enabled: true,
      playwright: {
        enabled: true,
      },
    },
    {
      cwd: stateRootDir,
      cacheDir: path.join(process.cwd(), ".tmp-playwright-cache"),
      stateRootDir,
    },
  );

  const server = resolveMcpServerDefinitions(config).find((item) => item.name === "playwright");
  assert(server);

  const normalized = await normalizePlaywrightToolInput(server, "browser_take_screenshot", {
    filename: "validation/direct-playwright.png",
  });
  assert.equal(typeof normalized.filename, "string");
  assert.match(String(normalized.filename), /[\\\/]\.athlete[\\\/]playwright-mcp[\\\/]output[\\\/]validation[\\\/]direct-playwright\.png$/i);
});

test("resolveRuntimeConfig can enable Playwright MCP from environment overrides without mutating saved config", async (t) => {
  const previous = {
    ATHLETE_MCP_ENABLED: process.env.ATHLETE_MCP_ENABLED,
    ATHLETE_MCP_PLAYWRIGHT_ENABLED: process.env.ATHLETE_MCP_PLAYWRIGHT_ENABLED,
    ATHLETE_MCP_PLAYWRIGHT_BROWSER: process.env.ATHLETE_MCP_PLAYWRIGHT_BROWSER,
    ATHLETE_MCP_PLAYWRIGHT_OUTPUT_MODE: process.env.ATHLETE_MCP_PLAYWRIGHT_OUTPUT_MODE,
    ATHLETE_MCP_PLAYWRIGHT_USER_DATA_DIR: process.env.ATHLETE_MCP_PLAYWRIGHT_USER_DATA_DIR,
    ATHLETE_MCP_PLAYWRIGHT_ISOLATED: process.env.ATHLETE_MCP_PLAYWRIGHT_ISOLATED,
  };

  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (typeof value === "string") {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  });

  process.env.ATHLETE_MCP_ENABLED = "1";
  process.env.ATHLETE_MCP_PLAYWRIGHT_ENABLED = "1";
  process.env.ATHLETE_MCP_PLAYWRIGHT_BROWSER = "chrome";
  process.env.ATHLETE_MCP_PLAYWRIGHT_OUTPUT_MODE = "file";
  process.env.ATHLETE_MCP_PLAYWRIGHT_USER_DATA_DIR = path.join(process.cwd(), ".tmp-playwright-env-profile");
  process.env.ATHLETE_MCP_PLAYWRIGHT_ISOLATED = "0";

  const runtime = await resolveRuntimeConfig({ cwd: process.cwd() });
  assert.equal(runtime.mcp.enabled, true);
  assert.equal(runtime.mcp.playwright.enabled, true);
  assert.equal(runtime.mcp.playwright.browser, "chrome");
  assert.equal(runtime.mcp.playwright.outputMode, "file");
  assert.equal(runtime.mcp.playwright.isolated, false);
  assert.equal(
    runtime.mcp.playwright.userDataDir,
    path.join(process.cwd(), ".tmp-playwright-env-profile"),
  );
});

test("teammate workers get a dedicated Playwright profile instead of sharing the lead profile", () => {
  const root = path.join(process.cwd(), ".tmp-playwright-team-root");
  const config = createTestRuntimeConfig(root);
  config.mcp = {
    enabled: true,
    servers: [],
    playwright: {
      ...getDefaultPlaywrightMcpConfig(),
      enabled: true,
      browser: "chrome",
      outputMode: "file",
      userDataDir: path.join(root, ".athlete", "playwright-mcp", "profile"),
    },
  };

  const env = buildTeammateWorkerEnv({
    rootDir: root,
    config,
    name: "worker-1",
    role: "researcher",
    prompt: "investigate browser task",
  });

  assert.equal(env.ATHLETE_MCP_PLAYWRIGHT_USER_DATA_DIR, path.join(
    root,
    ".athlete",
    "playwright-mcp",
    "teammates",
    "worker-1",
    "profile",
  ));
  assert.equal(env.ATHLETE_MCP_PLAYWRIGHT_ISOLATED, undefined);
});

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
      collectMcpTools: async () =>
        adaptDiscoveredMcpTools([
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
        ]),
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
      collectMcpTools: async () =>
        adaptDiscoveredMcpTools([
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
        ]),
      close: async () => undefined,
    },
  );

  const definition = registry.definitions.find((tool: any) => tool.function.name === toolName);
  assert(definition);
  assert.match(definition.function.description ?? "", /MCP server: playwright/i);
});

test("runtime registry surfaces Playwright browser tools ahead of file and shell tools for browser-first planning", async () => {
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
      collectMcpTools: async () =>
        adaptDiscoveredMcpTools([
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
        ]),
      close: async () => undefined,
    },
  );

  const names = registry.definitions.map((tool: any) => tool.function.name);
  assert(names.indexOf(navigateToolName) >= 0);
  assert(names.indexOf(snapshotToolName) >= 0);
  assert(names.indexOf(navigateToolName) < names.indexOf("list_files"));
  assert(names.indexOf(snapshotToolName) < names.indexOf("read_file"));
  assert(names.indexOf(snapshotToolName) < names.indexOf("run_shell"));
});
