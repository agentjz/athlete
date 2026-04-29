import { getDefaultMcpConfig, normalizeMcpConfig } from "../capabilities/mcp/config.js";
import {
  DEFAULT_TELEGRAM_CONFIG,
  normalizeTelegramConfig,
} from "../telegram/config.js";
import type { AppConfig } from "../types.js";

export const CURRENT_CONFIG_SCHEMA_VERSION = 1 as const;

const DEFAULT_CONFIG: AppConfig = {
  schemaVersion: CURRENT_CONFIG_SCHEMA_VERSION,
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  profile: "",
  yieldAfterToolSteps: 12,
  contextWindowMessages: 30,
  maxContextChars: 48_000,
  contextSummaryChars: 8_000,
  maxToolIterations: 8,
  maxContinuationBatches: 8,
  providerRecoveryMaxAttempts: 6,
  providerRecoveryMaxElapsedMs: 120_000,
  managedTurnMaxSlices: 8,
  managedTurnMaxElapsedMs: 180_000,
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

export function getDefaultConfig(): AppConfig {
  return structuredClone(DEFAULT_CONFIG);
}

export function normalizeConfig(
  config: AppConfig,
  runtime: {
    cwd?: string;
    cacheDir?: string;
    stateRootDir?: string;
  } = {},
): AppConfig {
  return {
    schemaVersion: CURRENT_CONFIG_SCHEMA_VERSION,
    provider: String(config.provider ?? DEFAULT_CONFIG.provider).trim() || DEFAULT_CONFIG.provider,
    baseUrl: config.baseUrl?.trim() || DEFAULT_CONFIG.baseUrl,
    model: config.model?.trim() || DEFAULT_CONFIG.model,
    profile: String(config.profile ?? "").trim(),
    thinking: normalizeThinking(config.thinking),
    reasoningEffort: normalizeReasoningEffort(config.reasoningEffort),
    maxOutputTokens: clampOptionalNumber(config.maxOutputTokens, 1, 384_000),
    yieldAfterToolSteps: clampNumber(
      config.yieldAfterToolSteps,
      0,
      50,
      DEFAULT_CONFIG.yieldAfterToolSteps,
    ),
    contextWindowMessages: clampNumber(config.contextWindowMessages, 6, 240, DEFAULT_CONFIG.contextWindowMessages),
    maxContextChars: clampNumber(config.maxContextChars, 8_000, 1_000_000, DEFAULT_CONFIG.maxContextChars),
    contextSummaryChars: clampNumber(
      config.contextSummaryChars,
      1_000,
      160_000,
      DEFAULT_CONFIG.contextSummaryChars,
    ),
    maxToolIterations: clampNumber(config.maxToolIterations, 1, 20, DEFAULT_CONFIG.maxToolIterations),
    maxContinuationBatches: clampNumber(
      config.maxContinuationBatches,
      1,
      20,
      DEFAULT_CONFIG.maxContinuationBatches,
    ),
    providerRecoveryMaxAttempts: clampNumber(
      config.providerRecoveryMaxAttempts ?? DEFAULT_CONFIG.providerRecoveryMaxAttempts ?? 6,
      1,
      20,
      DEFAULT_CONFIG.providerRecoveryMaxAttempts ?? 6,
    ),
    providerRecoveryMaxElapsedMs: clampNumber(
      config.providerRecoveryMaxElapsedMs ?? DEFAULT_CONFIG.providerRecoveryMaxElapsedMs ?? 120_000,
      10_000,
      600_000,
      DEFAULT_CONFIG.providerRecoveryMaxElapsedMs ?? 120_000,
    ),
    managedTurnMaxSlices: clampNumber(
      config.managedTurnMaxSlices ?? config.maxContinuationBatches ?? DEFAULT_CONFIG.maxContinuationBatches,
      1,
      20,
      DEFAULT_CONFIG.managedTurnMaxSlices ?? DEFAULT_CONFIG.maxContinuationBatches,
    ),
    managedTurnMaxElapsedMs: clampNumber(
      config.managedTurnMaxElapsedMs ?? DEFAULT_CONFIG.managedTurnMaxElapsedMs ?? 180_000,
      30_000,
      900_000,
      DEFAULT_CONFIG.managedTurnMaxElapsedMs ?? 180_000,
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

function normalizeReasoningEffort(value: unknown): AppConfig["reasoningEffort"] | undefined {
  switch (String(value ?? "").trim().toLowerCase()) {
    case "minimal":
      return "minimal";
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    case "xhigh":
      return "xhigh";
    case "max":
      return "max";
    default:
      return undefined;
  }
}

function normalizeThinking(value: unknown): AppConfig["thinking"] | undefined {
  switch (String(value ?? "").trim().toLowerCase()) {
    case "enabled":
      return "enabled";
    case "disabled":
      return "disabled";
    default:
      return undefined;
  }
}

export function mergeAppConfig(base: AppConfig, patch: Partial<AppConfig>): AppConfig {
  return {
    ...base,
    ...patch,
    schemaVersion: CURRENT_CONFIG_SCHEMA_VERSION,
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

function clampOptionalNumber(value: number | undefined, min: number, max: number): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}
