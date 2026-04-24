import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);

if (shouldSkipInstall()) {
  process.exit(0);
}

const target = resolveInstallTarget(process.env.DEADMOUSE_MCP_PLAYWRIGHT_BROWSER);
const cliPath = resolvePlaywrightCliPath();
const location = readInstallLocation(cliPath, target);

if (location === "<system>" || (location && fs.existsSync(location))) {
  process.exit(0);
}

const result = spawnSync(process.execPath, [cliPath, "install", target], {
  stdio: "inherit",
  windowsHide: true,
});

if ((result.status ?? 1) !== 0) {
  const message = `[deadmouse] Playwright browser bootstrap failed for "${target}". ` +
    `You can retry later, or skip with DEADMOUSE_SKIP_PLAYWRIGHT_BROWSER_INSTALL=1.`;

  if (isStrictInstall()) {
    console.error(message);
    process.exit(result.status ?? 1);
  }

  console.warn(message);
}

function resolveInstallTarget(rawValue) {
  switch (String(rawValue ?? "").trim().toLowerCase()) {
    case "chrome":
      return "chrome";
    case "firefox":
      return "firefox";
    case "webkit":
      return "webkit";
    case "msedge":
      return "msedge";
    default:
      return "chromium";
  }
}

function resolvePlaywrightCliPath() {
  const packageJsonPath = require.resolve("playwright/package.json");
  return path.join(path.dirname(packageJsonPath), "cli.js");
}

function readInstallLocation(cliPath, target) {
  const result = spawnSync(process.execPath, [cliPath, "install", "--dry-run", target], {
    encoding: "utf8",
    windowsHide: true,
  });

  if ((result.status ?? 1) !== 0) {
    return "";
  }

  const match = String(result.stdout ?? "").match(/Install location:\s+([^\r\n]+)/i);
  return match?.[1]?.trim() ?? "";
}

function shouldSkipInstall() {
  const value = String(process.env.DEADMOUSE_SKIP_PLAYWRIGHT_BROWSER_INSTALL ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function isStrictInstall() {
  const value = String(process.env.DEADMOUSE_STRICT_PLAYWRIGHT_BROWSER_INSTALL ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
