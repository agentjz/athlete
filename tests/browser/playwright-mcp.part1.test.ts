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

test("default config keeps Playwright MCP disabled but headed by default", () => {
  const playwright = (getDefaultConfig().mcp as any).playwright;

  assert.equal(playwright?.enabled, false);
  assert.equal(playwright?.browser, "chromium");
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

test("normalizeMcpConfig routes Playwright MCP artifacts into the project .deadmouse state directory", async (t) => {
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
  assert.match(outputDir, /[\\\/]\.deadmouse[\\\/]playwright-mcp/i);
  assert.match(configPath, /[\\\/]\.deadmouse[\\\/]playwright-mcp[\\\/]/i);
  assert.match(userDataDir, /[\\\/]\.deadmouse[\\\/]playwright-mcp[\\\/]/i);
  assert.equal(outputDir.startsWith(path.join(stateRootDir, ".deadmouse")), true);
  assert.equal(configPath.startsWith(path.join(stateRootDir, ".deadmouse")), true);
  assert.equal(userDataDir.startsWith(path.join(stateRootDir, ".deadmouse")), true);
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
