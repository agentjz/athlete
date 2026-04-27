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
  assert.match(String(normalized.filename), /[\\\/]\.deadmouse[\\\/]playwright-mcp[\\\/]output[\\\/]validation[\\\/]direct-playwright\.png$/i);
});

test("resolveRuntimeConfig can enable Playwright MCP from environment overrides without mutating saved config", async (t) => {
  const previous = {
    DEADMOUSE_MCP_ENABLED: process.env.DEADMOUSE_MCP_ENABLED,
    DEADMOUSE_MCP_PLAYWRIGHT_ENABLED: process.env.DEADMOUSE_MCP_PLAYWRIGHT_ENABLED,
    DEADMOUSE_MCP_PLAYWRIGHT_BROWSER: process.env.DEADMOUSE_MCP_PLAYWRIGHT_BROWSER,
    DEADMOUSE_MCP_PLAYWRIGHT_OUTPUT_MODE: process.env.DEADMOUSE_MCP_PLAYWRIGHT_OUTPUT_MODE,
    DEADMOUSE_MCP_PLAYWRIGHT_USER_DATA_DIR: process.env.DEADMOUSE_MCP_PLAYWRIGHT_USER_DATA_DIR,
    DEADMOUSE_MCP_PLAYWRIGHT_ISOLATED: process.env.DEADMOUSE_MCP_PLAYWRIGHT_ISOLATED,
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

  process.env.DEADMOUSE_MCP_ENABLED = "1";
  process.env.DEADMOUSE_MCP_PLAYWRIGHT_ENABLED = "1";
  process.env.DEADMOUSE_MCP_PLAYWRIGHT_BROWSER = "chrome";
  process.env.DEADMOUSE_MCP_PLAYWRIGHT_OUTPUT_MODE = "file";
  process.env.DEADMOUSE_MCP_PLAYWRIGHT_USER_DATA_DIR = path.join(process.cwd(), ".tmp-playwright-env-profile");
  process.env.DEADMOUSE_MCP_PLAYWRIGHT_ISOLATED = "0";

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

test("resolveRuntimeConfig reads Playwright MCP settings from the nearest project .deadmouse/.env", async (t) => {
  const root = await createTempWorkspace("playwright-project-env", t);
  const nestedCwd = path.join(root, "packages", "app");
  await fs.mkdir(path.join(root, ".deadmouse"), { recursive: true });
  await fs.mkdir(nestedCwd, { recursive: true });
  await fs.writeFile(
    path.join(root, ".deadmouse", ".env"),
    [
      "DEADMOUSE_API_KEY=test-key",
      "DEADMOUSE_MCP_ENABLED=1",
      "DEADMOUSE_MCP_PLAYWRIGHT_ENABLED=1",
      "DEADMOUSE_MCP_PLAYWRIGHT_BROWSER=chromium",
      "DEADMOUSE_MCP_PLAYWRIGHT_OUTPUT_MODE=file",
    ].join("\n"),
    "utf8",
  );

  const previous = {
    DEADMOUSE_API_KEY: process.env.DEADMOUSE_API_KEY,
    DEADMOUSE_MCP_ENABLED: process.env.DEADMOUSE_MCP_ENABLED,
    DEADMOUSE_MCP_PLAYWRIGHT_ENABLED: process.env.DEADMOUSE_MCP_PLAYWRIGHT_ENABLED,
    DEADMOUSE_MCP_PLAYWRIGHT_BROWSER: process.env.DEADMOUSE_MCP_PLAYWRIGHT_BROWSER,
    DEADMOUSE_MCP_PLAYWRIGHT_OUTPUT_MODE: process.env.DEADMOUSE_MCP_PLAYWRIGHT_OUTPUT_MODE,
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

  delete process.env.DEADMOUSE_API_KEY;
  delete process.env.DEADMOUSE_MCP_ENABLED;
  delete process.env.DEADMOUSE_MCP_PLAYWRIGHT_ENABLED;
  delete process.env.DEADMOUSE_MCP_PLAYWRIGHT_BROWSER;
  delete process.env.DEADMOUSE_MCP_PLAYWRIGHT_OUTPUT_MODE;

  const runtime = await resolveRuntimeConfig({ cwd: nestedCwd });
  assert.equal(runtime.mcp.enabled, true);
  assert.equal(runtime.mcp.playwright.enabled, true);
  assert.equal(runtime.mcp.playwright.browser, "chromium");
  assert.equal(runtime.mcp.playwright.outputMode, "file");
  assert.equal(runtime.mcp.servers.some((server) => server.name === "playwright"), true);
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
      userDataDir: path.join(root, ".deadmouse", "playwright-mcp", "profile"),
    },
  };

  const env = buildTeammateWorkerEnv({
    rootDir: root,
    config,
    name: "worker-1",
    role: "researcher",
    prompt: "investigate browser task",
  });

  assert.equal(env.DEADMOUSE_MCP_PLAYWRIGHT_USER_DATA_DIR, path.join(
    root,
    ".deadmouse",
    "playwright-mcp",
    "teammates",
    "worker-1",
    "profile",
  ));
  assert.equal(env.DEADMOUSE_MCP_PLAYWRIGHT_ISOLATED, undefined);
});
