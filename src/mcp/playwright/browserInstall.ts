import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

import { execa } from "execa";

import type { PlaywrightBrowserName, ResolvedMcpServerDefinition } from "../types.js";

export type PlaywrightInstallTarget = "chrome" | "firefox" | "webkit" | "msedge" | "chromium";

export interface PlaywrightBrowserInstallDependencies {
  getInstallLocation: (target: PlaywrightInstallTarget) => Promise<string>;
  install: (target: PlaywrightInstallTarget) => Promise<void>;
}

const localRequire = createRequire(__filename);
const installInflight = new Map<PlaywrightInstallTarget, Promise<void>>();

export async function ensurePlaywrightBrowserAvailableForServer(
  server: ResolvedMcpServerDefinition,
  dependencies: PlaywrightBrowserInstallDependencies = createDefaultDependencies(),
): Promise<void> {
  if (server.name !== "playwright" || shouldSkipPlaywrightBrowserInstall()) {
    return;
  }

  const target = resolvePlaywrightInstallTarget(readBrowserFlag(server.args));
  const installLocation = await dependencies.getInstallLocation(target);
  if (await isPlaywrightInstallLocationAvailable(installLocation)) {
    return;
  }

  const existing = installInflight.get(target);
  if (existing) {
    await existing;
    return;
  }

  const installPromise = (async () => {
    const currentLocation = await dependencies.getInstallLocation(target);
    if (await isPlaywrightInstallLocationAvailable(currentLocation)) {
      return;
    }

    await dependencies.install(target);
  })().finally(() => {
    installInflight.delete(target);
  });

  installInflight.set(target, installPromise);
  await installPromise;
}

export function resolvePlaywrightInstallTarget(browser: PlaywrightBrowserName): PlaywrightInstallTarget {
  switch (browser) {
    case "chromium":
      return "chromium";
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

export function parsePlaywrightInstallLocation(output: string): string {
  const match = output.match(/Install location:\s+([^\r\n]+)/i);
  return match?.[1]?.trim() ?? "";
}

export async function isPlaywrightInstallLocationAvailable(location: string): Promise<boolean> {
  if (!location) {
    return false;
  }

  if (location === "<system>") {
    return true;
  }

  try {
    await fs.access(location);
    return true;
  } catch {
    return false;
  }
}

function createDefaultDependencies(): PlaywrightBrowserInstallDependencies {
  return {
    getInstallLocation: readPlaywrightInstallLocation,
    install: installPlaywrightBrowser,
  };
}

async function readPlaywrightInstallLocation(target: PlaywrightInstallTarget): Promise<string> {
  const cliPath = resolvePlaywrightCliPath();
  const result = await execa(process.execPath, [cliPath, "install", "--dry-run", target], {
    reject: false,
    windowsHide: true,
  });

  if ((result.exitCode ?? 1) !== 0) {
    return "";
  }

  return parsePlaywrightInstallLocation(result.stdout);
}

async function installPlaywrightBrowser(target: PlaywrightInstallTarget): Promise<void> {
  const cliPath = resolvePlaywrightCliPath();
  await execa(process.execPath, [cliPath, "install", target], {
    reject: true,
    windowsHide: true,
    stdio: "inherit",
  });
}

function resolvePlaywrightCliPath(): string {
  const packageJsonPath = localRequire.resolve("playwright/package.json");
  return path.join(path.dirname(packageJsonPath), "cli.js");
}

function readBrowserFlag(args: string[]): PlaywrightBrowserName {
  const index = args.indexOf("--browser");
  if (index < 0) {
    return "chromium";
  }

  switch (String(args[index + 1] ?? "").trim().toLowerCase()) {
    case "chromium":
      return "chromium";
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

function shouldSkipPlaywrightBrowserInstall(): boolean {
  const value = String(process.env.DEADMOUSE_SKIP_PLAYWRIGHT_BROWSER_INSTALL ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
