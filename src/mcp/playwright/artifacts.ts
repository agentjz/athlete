import fs from "node:fs/promises";
import path from "node:path";
import type { Dirent } from "node:fs";

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

  if (outputDir) {
    await migrateLegacyRootArtifacts(outputDir);
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

async function migrateLegacyRootArtifacts(outputDir: string): Promise<void> {
  const stateDir = resolveManagedStateDir(outputDir);
  if (!stateDir) {
    return;
  }

  const stateRootDir = path.dirname(path.dirname(stateDir));
  const legacyRootDir = path.join(stateRootDir, ".playwright-mcp");
  const legacyTargetDir = path.join(stateDir, "legacy-root-artifacts");

  if (await pathExists(legacyRootDir)) {
    await fs.mkdir(legacyTargetDir, { recursive: true });
    const migratedLegacyDir = path.join(legacyTargetDir, ".playwright-mcp");
    if (!(await pathExists(migratedLegacyDir))) {
      await fs.rename(legacyRootDir, migratedLegacyDir);
    }
  }

  const rootEntries = await safeReadDir(stateRootDir);
  if (rootEntries.length === 0) {
    return;
  }

  for (const entry of rootEntries) {
    if (!entry.isFile() || !/^playwright-.*\.(png|jpe?g|md|json)$/i.test(entry.name)) {
      continue;
    }

    await fs.mkdir(legacyTargetDir, { recursive: true });
    const sourcePath = path.join(stateRootDir, entry.name);
    const targetPath = path.join(legacyTargetDir, entry.name);

    if (await pathExists(targetPath)) {
      continue;
    }

    await fs.rename(sourcePath, targetPath);
  }
}

function resolveManagedStateDir(outputDir: string): string {
  const normalized = path.normalize(outputDir);
  const marker = path.normalize(path.join(".athlete", "playwright-mcp"));
  const markerIndex = normalized.toLowerCase().indexOf(marker.toLowerCase());

  if (markerIndex < 0) {
    return "";
  }

  return normalized.slice(0, markerIndex + marker.length);
}

function isManagedPlaywrightConfigPath(configPath: string): boolean {
  return configPath.toLowerCase().endsWith(
    path.normalize(path.join(".athlete", "playwright-mcp", "config.json")).toLowerCase(),
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

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function safeReadDir(targetPath: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(targetPath, { withFileTypes: true });
  } catch {
    return [];
  }
}
