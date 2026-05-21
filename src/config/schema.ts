import { normalizeTelegramConfig } from "../config/hosts.js";
import { normalizeExtensions } from "./extensions.js";
import type { AppConfig } from "../types.js";

export const CURRENT_CONFIG_SCHEMA_VERSION = 1 as const;

export function normalizeRuntimeConfig(
  config: AppConfig,
  runtime: {
    cwd?: string;
    cacheDir?: string;
    stateRootDir?: string;
  } = {},
): AppConfig {
  return {
    schemaVersion: CURRENT_CONFIG_SCHEMA_VERSION,
    provider: requireTextConfig(config.provider, "provider"),
    baseUrl: requireTextConfig(config.baseUrl, "baseUrl"),
    model: requireTextConfig(config.model, "model"),
    profile: requireTextConfig(config.profile, "profile"),
    thinking: normalizeThinking(config.thinking),
    reasoningEffort: normalizeReasoningEffort(config.reasoningEffort),
    maxOutputTokens: clampNumber(config.maxOutputTokens, 1, 384_000, "maxOutputTokens"),
    contextWindowMessages: clampNumber(config.contextWindowMessages, 6, 480, "contextWindowMessages"),
    maxContextChars: clampNumber(config.maxContextChars, 8_000, 1_000_000, "maxContextChars"),
    contextSummaryChars: clampNumber(
      config.contextSummaryChars,
      1_000,
      160_000,
      "contextSummaryChars",
    ),
    maxReadBytes: clampNumber(config.maxReadBytes, 2_000, 500_000, "maxReadBytes"),
    projectDocMaxBytes: clampNumber(config.projectDocMaxBytes, 1_000, 500_000, "projectDocMaxBytes"),
    commandStallTimeoutMs: clampNumber(config.commandStallTimeoutMs, 2_000, 300_000, "commandStallTimeoutMs"),
    showReasoning: requireBooleanConfig(config.showReasoning, "showReasoning"),
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

function requireTextConfig(value: unknown, name: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`Missing config value: ${name}.`);
  }
  return normalized;
}

function requireBooleanConfig(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Missing or invalid config value: ${name}.`);
  }
  return value;
}

function clampNumber(value: number, min: number, max: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Missing or invalid config value: ${name}.`);
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}
