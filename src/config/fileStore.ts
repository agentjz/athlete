import fs from "node:fs/promises";

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
