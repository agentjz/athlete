import fs from "node:fs/promises";
import path from "node:path";

import type { ResolvedMcpServerDefinition } from "../types.js";

export async function preparePlaywrightRuntimeArtifacts(
  server: ResolvedMcpServerDefinition,
): Promise<void> {
  if (server.name !== "playwright") {
    return;
  }

  const configPath = readFlagValue(server.args, "--config");
  const outputDir = readFlagValue(server.args, "--output-dir");
  const userDataDir = readFlagValue(server.args, "--user-data-dir");
  const storageState = readFlagValue(server.args, "--storage-state");

  if (outputDir) {
    await fs.mkdir(outputDir, { recursive: true });
  }

  if (userDataDir) {
    await fs.mkdir(userDataDir, { recursive: true });
  }

  if (storageState) {
    await fs.mkdir(path.dirname(storageState), { recursive: true });
  }

  if (configPath) {
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await ensureGeneratedConfigFile(server.args, configPath, outputDir, userDataDir);
  }

}

async function ensureGeneratedConfigFile(
  args: string[],
  configPath: string,
  outputDir: string,
  userDataDir: string,
): Promise<void> {
  if (!isManagedPlaywrightConfigPath(configPath)) {
    return;
  }

  const generatedConfig = {
    browser: {
      isolated: hasFlag(args, "--isolated") || undefined,
      userDataDir: hasFlag(args, "--isolated") ? undefined : userDataDir || undefined,
      launchOptions: {
        headless: hasFlag(args, "--headless"),
        channel: resolveBrowserChannel(readFlagValue(args, "--browser")),
      },
    },
    outputDir: outputDir || undefined,
    saveSession: hasFlag(args, "--save-session") || undefined,
  };

  await fs.writeFile(configPath, `${JSON.stringify(generatedConfig, null, 2)}\n`, "utf8");
}

function isManagedPlaywrightConfigPath(configPath: string): boolean {
  return configPath.toLowerCase().endsWith(
    path.normalize(path.join(".deadmouse", "playwright-mcp", "config.json")).toLowerCase(),
  );
}

function resolveBrowserChannel(browserName: string): string | undefined {
  switch (browserName.trim().toLowerCase()) {
    case "chrome":
      return "chrome";
    case "msedge":
      return "msedge";
    default:
      return undefined;
  }
}

function hasFlag(args: string[], flagName: string): boolean {
  return args.includes(flagName);
}

function readFlagValue(args: string[], flagName: string): string {
  const index = args.indexOf(flagName);
  if (index < 0) {
    return "";
  }

  return String(args[index + 1] ?? "");
}

