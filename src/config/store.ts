import fs from "node:fs/promises";

import { loadDotEnvFiles } from "./env.js";
import { resolveProjectRoots } from "../context/repoRoots.js";
import { getDefaultMcpConfig, normalizeMcpConfig } from "../mcp/config.js";
import { getAppPaths } from "./paths.js";
import {
  DEFAULT_TELEGRAM_CONFIG,
  normalizeTelegramConfig,
  parseTelegramAllowedUserIds,
  resolveTelegramRuntimeConfig,
} from "../telegram/config.js";
import type { AgentMode, AppConfig, CliOverrides, MineruRuntimeConfig, RuntimeConfig } from "../types.js";

const DEFAULT_CONFIG: AppConfig = {
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-reasoner",
  mode: "agent",
  allowedRoots: ["."],
  yieldAfterToolSteps: 12,
  contextWindowMessages: 30,
  maxContextChars: 48_000,
  contextSummaryChars: 8_000,
  maxToolIterations: 8,
  maxContinuationBatches: 8,
  maxReadBytes: 120_000,
  maxSearchResults: 80,
  maxSpreadsheetPreviewRows: 20,
  maxSpreadsheetPreviewColumns: 12,
  commandStallTimeoutMs: 30_000,
  commandMaxRetries: 1,
  commandRetryBackoffMs: 1_500,
  showReasoning: true,
  mcp: getDefaultMcpConfig(),
  telegram: DEFAULT_TELEGRAM_CONFIG,
};

export async function ensureAppDirectories(): Promise<ReturnType<typeof getAppPaths>> {
  const paths = getAppPaths();
  await fs.mkdir(paths.configDir, { recursive: true });
  await fs.mkdir(paths.dataDir, { recursive: true });
  await fs.mkdir(paths.cacheDir, { recursive: true });
  await fs.mkdir(paths.sessionsDir, { recursive: true });
  await fs.mkdir(paths.changesDir, { recursive: true });
  return paths;
}

export function getDefaultConfig(): AppConfig {
  return structuredClone(DEFAULT_CONFIG);
}

export async function loadConfig(): Promise<AppConfig> {
  const paths = await ensureAppDirectories();

  try {
    const raw = await fs.readFile(paths.configFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return normalizeConfig(mergeAppConfig(DEFAULT_CONFIG, parsed));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return getDefaultConfig();
    }
    throw error;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const paths = await ensureAppDirectories();
  const normalized = normalizeConfig(config);
  await fs.writeFile(paths.configFile, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

export async function updateConfig(
  updater: (config: AppConfig) => AppConfig | Promise<AppConfig>,
): Promise<AppConfig> {
  const current = await loadConfig();
  const next = await updater(current);
  await saveConfig(next);
  return next;
}

export async function resolveRuntimeConfig(overrides: CliOverrides = {}): Promise<RuntimeConfig> {
  const cwd = overrides.cwd ?? process.cwd();
  loadDotEnvFiles(cwd);
  const paths = await ensureAppDirectories();
  const fileConfig = await loadConfig();
  const projectRoots = await resolveProjectRoots(cwd);
  const playwrightEnabled = parseBooleanEnv(process.env.ATHLETE_MCP_PLAYWRIGHT_ENABLED) ?? fileConfig.mcp.playwright.enabled;
  const telegramAllowedUserIds = process.env.ATHLETE_TELEGRAM_ALLOWED_USER_IDS
    ? parseTelegramAllowedUserIds(process.env.ATHLETE_TELEGRAM_ALLOWED_USER_IDS)
    : fileConfig.telegram.allowedUserIds;
  const telegramConfig = normalizeTelegramConfig({
    ...fileConfig.telegram,
    token: process.env.ATHLETE_TELEGRAM_TOKEN ?? fileConfig.telegram.token,
    apiBaseUrl: process.env.ATHLETE_TELEGRAM_API_BASE_URL ?? fileConfig.telegram.apiBaseUrl,
    proxyUrl: process.env.ATHLETE_TELEGRAM_PROXY_URL ?? fileConfig.telegram.proxyUrl,
    allowedUserIds: telegramAllowedUserIds,
    polling: {
      ...fileConfig.telegram.polling,
      timeoutSeconds:
        parseIntegerEnv(process.env.ATHLETE_TELEGRAM_POLLING_TIMEOUT_SECONDS) ?? fileConfig.telegram.polling.timeoutSeconds,
      limit: parseIntegerEnv(process.env.ATHLETE_TELEGRAM_POLLING_LIMIT) ?? fileConfig.telegram.polling.limit,
      retryBackoffMs:
        parseIntegerEnv(process.env.ATHLETE_TELEGRAM_POLLING_RETRY_BACKOFF_MS) ??
        fileConfig.telegram.polling.retryBackoffMs,
    },
    delivery: {
      ...fileConfig.telegram.delivery,
      maxRetries:
        parseIntegerEnv(process.env.ATHLETE_TELEGRAM_DELIVERY_MAX_RETRIES) ?? fileConfig.telegram.delivery.maxRetries,
      baseDelayMs:
        parseIntegerEnv(process.env.ATHLETE_TELEGRAM_DELIVERY_BASE_DELAY_MS) ??
        fileConfig.telegram.delivery.baseDelayMs,
      maxDelayMs:
        parseIntegerEnv(process.env.ATHLETE_TELEGRAM_DELIVERY_MAX_DELAY_MS) ?? fileConfig.telegram.delivery.maxDelayMs,
    },
    messageChunkChars:
      parseIntegerEnv(process.env.ATHLETE_TELEGRAM_MESSAGE_CHUNK_CHARS) ?? fileConfig.telegram.messageChunkChars,
    typingIntervalMs:
      parseIntegerEnv(process.env.ATHLETE_TELEGRAM_TYPING_INTERVAL_MS) ?? fileConfig.telegram.typingIntervalMs,
  });

  const merged = normalizeConfig({
    ...fileConfig,
    model: process.env.ATHLETE_MODEL ?? overrides.model ?? fileConfig.model,
    baseUrl: process.env.ATHLETE_BASE_URL ?? fileConfig.baseUrl,
    mode:
      parseAgentMode(process.env.ATHLETE_MODE) ??
      overrides.mode ??
      fileConfig.mode,
    mcp: {
      ...fileConfig.mcp,
      enabled: parseBooleanEnv(process.env.ATHLETE_MCP_ENABLED) ?? fileConfig.mcp.enabled,
      playwright: {
        ...fileConfig.mcp.playwright,
        enabled: playwrightEnabled,
        browser: parsePlaywrightBrowserEnv(process.env.ATHLETE_MCP_PLAYWRIGHT_BROWSER) ?? fileConfig.mcp.playwright.browser,
        headless: parseBooleanEnv(process.env.ATHLETE_MCP_PLAYWRIGHT_HEADLESS) ?? fileConfig.mcp.playwright.headless,
        isolated: parseBooleanEnv(process.env.ATHLETE_MCP_PLAYWRIGHT_ISOLATED) ?? fileConfig.mcp.playwright.isolated,
        userDataDir: process.env.ATHLETE_MCP_PLAYWRIGHT_USER_DATA_DIR ?? fileConfig.mcp.playwright.userDataDir,
        outputMode: parsePlaywrightOutputModeEnv(process.env.ATHLETE_MCP_PLAYWRIGHT_OUTPUT_MODE) ?? fileConfig.mcp.playwright.outputMode,
        saveSession: parseBooleanEnv(process.env.ATHLETE_MCP_PLAYWRIGHT_SAVE_SESSION) ?? fileConfig.mcp.playwright.saveSession,
      },
    },
    telegram: telegramConfig,
  }, {
    cwd,
    cacheDir: paths.cacheDir,
    stateRootDir: projectRoots.stateRootDir,
  });

  const apiKey = process.env.ATHLETE_API_KEY ?? "";

  return {
    ...merged,
    apiKey,
    mineru: readMineruRuntimeConfig(),
    paths,
    telegram: resolveTelegramRuntimeConfig(merged.telegram, projectRoots.stateRootDir),
  };
}

export function parseAgentMode(value?: string): AgentMode | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "read-only") {
    return "read-only";
  }

  if (normalized === "agent") {
    return "agent";
  }

  return undefined;
}

function normalizeConfig(
  config: AppConfig,
  runtime: {
    cwd?: string;
    cacheDir?: string;
    stateRootDir?: string;
  } = {},
): AppConfig {
  const allowedRoots =
    Array.isArray(config.allowedRoots) && config.allowedRoots.length > 0
      ? [...new Set(config.allowedRoots.map((value) => String(value).trim()).filter(Boolean))]
      : ["."];

  return {
    provider: "deepseek",
    baseUrl: config.baseUrl?.trim() || DEFAULT_CONFIG.baseUrl,
    model: config.model?.trim() || DEFAULT_CONFIG.model,
    mode: parseAgentMode(config.mode) ?? DEFAULT_CONFIG.mode,
    allowedRoots,
    yieldAfterToolSteps: clampNumber(
      config.yieldAfterToolSteps,
      0,
      50,
      DEFAULT_CONFIG.yieldAfterToolSteps,
    ),
    contextWindowMessages: clampNumber(config.contextWindowMessages, 6, 120, DEFAULT_CONFIG.contextWindowMessages),
    maxContextChars: clampNumber(config.maxContextChars, 8_000, 300_000, DEFAULT_CONFIG.maxContextChars),
    contextSummaryChars: clampNumber(
      config.contextSummaryChars,
      1_000,
      40_000,
      DEFAULT_CONFIG.contextSummaryChars,
    ),
    maxToolIterations: clampNumber(config.maxToolIterations, 1, 20, DEFAULT_CONFIG.maxToolIterations),
    maxContinuationBatches: clampNumber(
      config.maxContinuationBatches,
      1,
      20,
      DEFAULT_CONFIG.maxContinuationBatches,
    ),
    maxReadBytes: clampNumber(config.maxReadBytes, 2_000, 500_000, DEFAULT_CONFIG.maxReadBytes),
    maxSearchResults: clampNumber(config.maxSearchResults, 10, 500, DEFAULT_CONFIG.maxSearchResults),
    maxSpreadsheetPreviewRows: clampNumber(
      config.maxSpreadsheetPreviewRows,
      1,
      200,
      DEFAULT_CONFIG.maxSpreadsheetPreviewRows,
    ),
    maxSpreadsheetPreviewColumns: clampNumber(
      config.maxSpreadsheetPreviewColumns,
      1,
      100,
      DEFAULT_CONFIG.maxSpreadsheetPreviewColumns,
    ),
    commandStallTimeoutMs: clampNumber(config.commandStallTimeoutMs, 2_000, 300_000, DEFAULT_CONFIG.commandStallTimeoutMs),
    commandMaxRetries: clampNumber(config.commandMaxRetries, 0, 3, DEFAULT_CONFIG.commandMaxRetries),
    commandRetryBackoffMs: clampNumber(
      config.commandRetryBackoffMs,
      200,
      10_000,
      DEFAULT_CONFIG.commandRetryBackoffMs,
    ),
    showReasoning: Boolean(config.showReasoning),
    mcp: normalizeMcpConfig(config.mcp, runtime),
    telegram: normalizeTelegramConfig(config.telegram),
  };
}

function mergeAppConfig(base: AppConfig, patch: Partial<AppConfig>): AppConfig {
  return {
    ...base,
    ...patch,
    mcp: {
      ...base.mcp,
      ...(patch.mcp ?? {}),
      playwright: {
        ...base.mcp.playwright,
        ...(patch.mcp?.playwright ?? {}),
      },
    },
    telegram: {
      ...base.telegram,
      ...(patch.telegram ?? {}),
      polling: {
        ...base.telegram.polling,
        ...(patch.telegram?.polling ?? {}),
      },
      delivery: {
        ...base.telegram.delivery,
        ...(patch.telegram?.delivery ?? {}),
      },
    },
  };
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function parseIntegerEnv(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePlaywrightBrowserEnv(value: string | undefined): RuntimeConfig["mcp"]["playwright"]["browser"] | undefined {
  switch ((value ?? "").trim().toLowerCase()) {
    case "chrome":
      return "chrome";
    case "firefox":
      return "firefox";
    case "webkit":
      return "webkit";
    case "msedge":
      return "msedge";
    default:
      return undefined;
  }
}

function parsePlaywrightOutputModeEnv(value: string | undefined): RuntimeConfig["mcp"]["playwright"]["outputMode"] | undefined {
  switch ((value ?? "").trim().toLowerCase()) {
    case "file":
      return "file";
    case "stdout":
      return "stdout";
    default:
      return undefined;
  }
}

function readMineruRuntimeConfig(): MineruRuntimeConfig {
  return {
    token: (process.env.MINERU_API_TOKEN ?? "").trim(),
    baseUrl: (process.env.MINERU_BASE_URL ?? "https://mineru.net/api/v4").trim(),
    modelVersion: (process.env.MINERU_MODEL_VERSION ?? "vlm").trim(),
    language: (process.env.MINERU_LANGUAGE ?? "ch").trim(),
    enableTable: parseBooleanEnv(process.env.MINERU_ENABLE_TABLE) ?? true,
    enableFormula: parseBooleanEnv(process.env.MINERU_ENABLE_FORMULA) ?? true,
    pollIntervalMs: clampNumber(
      Number.parseInt(process.env.MINERU_POLL_INTERVAL_MS ?? "", 10),
      200,
      60_000,
      2_000,
    ),
    timeoutMs: clampNumber(
      Number.parseInt(process.env.MINERU_TIMEOUT_MS ?? "", 10),
      5_000,
      60 * 60 * 1000,
      300_000,
    ),
  };
}

