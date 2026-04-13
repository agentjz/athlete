import { getDefaultMcpConfig, normalizeMcpConfig } from "../mcp/config.js";
import {
  DEFAULT_TELEGRAM_CONFIG,
  normalizeTelegramConfig,
} from "../telegram/config.js";
import {
  DEFAULT_WEIXIN_CONFIG,
  normalizeWeixinConfig,
} from "../weixin/config.js";
import type { AgentMode, AppConfig } from "../types.js";

export const CURRENT_CONFIG_SCHEMA_VERSION = 1 as const;

const DEFAULT_CONFIG: AppConfig = {
  schemaVersion: CURRENT_CONFIG_SCHEMA_VERSION,
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-reasoner",
  mode: "agent",
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
  weixin: DEFAULT_WEIXIN_CONFIG,
};

export function getDefaultConfig(): AppConfig {
  return structuredClone(DEFAULT_CONFIG);
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
    mode: parseAgentMode(config.mode) ?? DEFAULT_CONFIG.mode,
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
    weixin: normalizeWeixinConfig(config.weixin),
  };
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
    weixin: {
      ...base.weixin,
      ...(patch.weixin ?? {}),
      polling: {
        ...base.weixin.polling,
        ...(patch.weixin?.polling ?? {}),
      },
      delivery: {
        ...base.weixin.delivery,
        ...(patch.weixin?.delivery ?? {}),
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
