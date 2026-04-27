import assert from "node:assert/strict";
import test from "node:test";

import {
  ensurePlaywrightBrowserAvailableForServer,
  isPlaywrightInstallLocationAvailable,
  parsePlaywrightInstallLocation,
  resolvePlaywrightInstallTarget,
} from "../../src/capabilities/mcp/playwright/browserInstall.js";

test("resolvePlaywrightInstallTarget maps runtime browser config to install targets", () => {
  assert.equal(resolvePlaywrightInstallTarget("chromium"), "chromium");
  assert.equal(resolvePlaywrightInstallTarget("chrome"), "chrome");
  assert.equal(resolvePlaywrightInstallTarget("firefox"), "firefox");
  assert.equal(resolvePlaywrightInstallTarget("webkit"), "webkit");
  assert.equal(resolvePlaywrightInstallTarget("msedge"), "msedge");
});

test("parsePlaywrightInstallLocation reads the primary install location from playwright CLI dry-run output", () => {
  assert.equal(
    parsePlaywrightInstallLocation("Chrome (playwright chrome v123)\n  Install location:    <system>\n"),
    "<system>",
  );
  assert.equal(
    parsePlaywrightInstallLocation("Firefox\n  Install location:    C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\firefox-1511\n"),
    "C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\firefox-1511",
  );
});

test("isPlaywrightInstallLocationAvailable treats <system> as already installed", async () => {
  assert.equal(await isPlaywrightInstallLocationAvailable("<system>"), true);
  assert.equal(await isPlaywrightInstallLocationAvailable(""), false);
});

test("ensurePlaywrightBrowserAvailableForServer skips installation when the browser is already available", async () => {
  let installCalls = 0;

  await ensurePlaywrightBrowserAvailableForServer(
    {
      id: "playwright",
      name: "playwright",
      enabled: true,
      transport: "stdio",
      command: "npx",
      args: ["@playwright/mcp@latest", "--browser", "chrome"],
      env: {},
      cwd: "",
      url: "",
      include: [],
      exclude: [],
      timeoutMs: 30_000,
      trust: true,
      auth: {
        type: "none",
        tokenEnv: "",
        headers: {},
      },
    },
    {
      getInstallLocation: async () => "<system>",
      install: async () => {
        installCalls += 1;
      },
    },
  );

  assert.equal(installCalls, 0);
});

test("ensurePlaywrightBrowserAvailableForServer installs a missing browser only once across concurrent calls", async () => {
  let installCalls = 0;
  let installed = false;
  const server = {
    id: "playwright",
    name: "playwright",
    enabled: true,
    transport: "stdio",
    command: "npx",
    args: ["@playwright/mcp@latest", "--browser", "firefox"],
    env: {},
    cwd: "",
    url: "",
    include: [],
    exclude: [],
    timeoutMs: 30_000,
    trust: true,
    auth: {
      type: "none",
      tokenEnv: "",
      headers: {},
    },
  } as const;

  await Promise.all([
    ensurePlaywrightBrowserAvailableForServer(server as any, {
      getInstallLocation: async () => (installed ? "<system>" : "C:\\missing-firefox"),
      install: async () => {
        installCalls += 1;
        installed = true;
      },
    }),
    ensurePlaywrightBrowserAvailableForServer(server as any, {
      getInstallLocation: async () => (installed ? "<system>" : "C:\\missing-firefox"),
      install: async () => {
        installCalls += 1;
        installed = true;
      },
    }),
  ]);

  assert.equal(installCalls, 1);
});
