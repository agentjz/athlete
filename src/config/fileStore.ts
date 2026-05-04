import fs from "node:fs/promises";
import path from "node:path";

import {
  createInvalidConfigJsonError,
  createInvalidConfigShapeError,
  createUnsupportedConfigSchemaError,
} from "./errors.js";
import { getAppPaths } from "./paths.js";
import {
  CURRENT_CONFIG_SCHEMA_VERSION,
  getDefaultConfig,
  mergeAppConfig,
  normalizeConfig,
} from "./schema.js";
import type { AppConfig } from "../types.js";

type ParsedConfigRecord = Partial<AppConfig> & { schemaVersion?: unknown };

export async function ensureAppDirectories(rootDir = process.cwd()): Promise<ReturnType<typeof getAppPaths>> {
  const paths = getAppPaths(rootDir);
  await fs.mkdir(paths.configDir, { recursive: true });
  await fs.mkdir(paths.dataDir, { recursive: true });
  await fs.mkdir(paths.cacheDir, { recursive: true });
  await fs.mkdir(paths.sessionsDir, { recursive: true });
  await fs.mkdir(paths.changesDir, { recursive: true });
  await ensureRuntimeStateIgnoredByGit(rootDir, paths.configDir);
  return paths;
}

export async function loadConfig(rootDir = process.cwd()): Promise<AppConfig> {
  const paths = await ensureAppDirectories(rootDir);
  const stored = await readStoredConfig(paths.configFile);
  if (!stored) {
    return getDefaultConfig();
  }

  return normalizeStoredConfig(stored, paths.configFile);
}

export async function saveConfig(config: AppConfig, rootDir = process.cwd()): Promise<void> {
  const paths = await ensureAppDirectories(rootDir);
  const normalized = normalizeConfig(config);
  await fs.writeFile(paths.configFile, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

export async function updateConfig(
  updater: (config: AppConfig) => AppConfig | Promise<AppConfig>,
  rootDir = process.cwd(),
): Promise<AppConfig> {
  const current = await loadConfig(rootDir);
  const next = await updater(current);
  await saveConfig(next, rootDir);
  return next;
}

async function readStoredConfig(configFile: string): Promise<ParsedConfigRecord | null> {
  try {
    const raw = await fs.readFile(configFile, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw createInvalidConfigShapeError(configFile);
    }
    return parsed as ParsedConfigRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    if (error instanceof SyntaxError) {
      throw createInvalidConfigJsonError(configFile, error);
    }
    throw error;
  }
}

function normalizeStoredConfig(
  parsed: ParsedConfigRecord,
  configFile: string,
): AppConfig {
  const schemaVersion = parsed.schemaVersion;
  if (schemaVersion === undefined) {
    throw createUnsupportedConfigSchemaError(configFile, schemaVersion, CURRENT_CONFIG_SCHEMA_VERSION);
  }

  if (typeof schemaVersion !== "number" || !Number.isFinite(schemaVersion) || Math.trunc(schemaVersion) !== CURRENT_CONFIG_SCHEMA_VERSION) {
    throw createUnsupportedConfigSchemaError(configFile, schemaVersion, CURRENT_CONFIG_SCHEMA_VERSION);
  }

  return normalizeConfig(mergeAppConfig(getDefaultConfig(), parsed as Partial<AppConfig>));
}

async function ensureRuntimeStateIgnoredByGit(rootDir: string, stateDir: string): Promise<void> {
  const gitDir = await resolveGitDir(rootDir);
  if (!gitDir) {
    return;
  }

  const relativeStateDir = path.relative(path.resolve(rootDir), path.resolve(stateDir)).replace(/\\/g, "/");
  if (!relativeStateDir || relativeStateDir.startsWith("..")) {
    return;
  }

  const excludePath = path.join(gitDir, "info", "exclude");
  const ignoreEntry = `/${relativeStateDir}/`;
  const existing = await fs.readFile(excludePath, "utf8").catch(() => "");
  const lines = existing.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes(ignoreEntry)) {
    return;
  }

  await fs.mkdir(path.dirname(excludePath), { recursive: true });
  const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  await fs.appendFile(excludePath, `${prefix}# Kitty runtime state\n${ignoreEntry}\n`, "utf8");
}

async function resolveGitDir(rootDir: string): Promise<string | null> {
  const dotGitPath = path.join(path.resolve(rootDir), ".git");
  const stat = await fs.stat(dotGitPath).catch(() => null);
  if (!stat) {
    return null;
  }

  if (stat.isDirectory()) {
    return dotGitPath;
  }

  if (!stat.isFile()) {
    return null;
  }

  const content = await fs.readFile(dotGitPath, "utf8").catch(() => "");
  const match = /^gitdir:\s*(.+)$/im.exec(content);
  if (!match?.[1]) {
    return null;
  }

  return path.resolve(rootDir, match[1].trim());
}
