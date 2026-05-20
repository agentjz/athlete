import {
  DEFAULT_TELEGRAM_CONFIG,
  normalizeTelegramConfig,
} from "../config/hosts.js";
import {
  getDefaultExtensions,
  mergeExtensions,
  normalizeExtensions,
} from "./extensions.js";
import type { AppConfig } from "../types.js";

export const CURRENT_CONFIG_SCHEMA_VERSION = 1 as const;

const DEFAULT_CONFIG: AppConfig = {
  schemaVersion: CURRENT_CONFIG_SCHEMA_VERSION,
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  profile: "intp",
  contextWindowMessages: 30,
  maxContextChars: 48_000,
  contextSummaryChars: 8_000,
  maxReadBytes: 120_000,
  commandStallTimeoutMs: 30_000,
  showReasoning: true,
  telegram: DEFAULT_TELEGRAM_CONFIG,
  extensions: getDefaultExtensions(),
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
    profile: String(config.profile ?? DEFAULT_CONFIG.profile).trim() || DEFAULT_CONFIG.profile,
    thinking: normalizeThinking(config.thinking),
    reasoningEffort: normalizeReasoningEffort(config.reasoningEffort),
    maxOutputTokens: clampOptionalNumber(config.maxOutputTokens, 1, 384_000),
    contextWindowMessages: clampNumber(config.contextWindowMessages, 6, 240, DEFAULT_CONFIG.contextWindowMessages),
    maxContextChars: clampNumber(config.maxContextChars, 8_000, 1_000_000, DEFAULT_CONFIG.maxContextChars),
    contextSummaryChars: clampNumber(
      config.contextSummaryChars,
      1_000,
      160_000,
      DEFAULT_CONFIG.contextSummaryChars,
    ),
    maxReadBytes: clampNumber(config.maxReadBytes, 2_000, 500_000, DEFAULT_CONFIG.maxReadBytes),
    commandStallTimeoutMs: clampNumber(config.commandStallTimeoutMs, 2_000, 300_000, DEFAULT_CONFIG.commandStallTimeoutMs),
    showReasoning: Boolean(config.showReasoning),
    telegram: normalizeTelegramConfig(config.telegram),
    extensions: normalizeExtensions(config.extensions),
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
    extensions: mergeExtensions(base.extensions, patch.extensions),
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
