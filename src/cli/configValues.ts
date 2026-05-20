import type { AppConfig, CliOverrides } from "../types.js";
import { tryParseJson } from "../utils/json.js";

export const APP_CONFIG_KEYS = [
  "schemaVersion",
  "provider",
  "baseUrl",
  "model",
  "profile",
  "thinking",
  "reasoningEffort",
  "maxOutputTokens",
  "contextWindowMessages",
  "maxContextChars",
  "contextSummaryChars",
  "maxReadBytes",
  "commandStallTimeoutMs",
  "showReasoning",
  "telegram",
  "extensions",
] as const satisfies ReadonlyArray<keyof AppConfig>;

const KNOWN_CONFIG_KEYS = new Set<keyof AppConfig>(APP_CONFIG_KEYS);
const MUTABLE_CONFIG_KEYS = new Set<keyof AppConfig>([
  "provider",
  "baseUrl",
  "model",
  "profile",
  "thinking",
  "reasoningEffort",
  "maxOutputTokens",
  "contextWindowMessages",
  "maxContextChars",
  "contextSummaryChars",
  "maxReadBytes",
  "commandStallTimeoutMs",
  "showReasoning",
  "telegram",
  "extensions",
]);

export function isKnownConfigKey(key: string): key is keyof AppConfig {
  return KNOWN_CONFIG_KEYS.has(key as keyof AppConfig);
}

export function isMutableConfigKey(key: keyof AppConfig): boolean {
  return MUTABLE_CONFIG_KEYS.has(key);
}

export function coerceConfigValue(key: keyof AppConfig, rawValue: string): AppConfig[keyof AppConfig] {
  switch (key) {
    case "schemaVersion":
      throw new Error("schemaVersion is managed by Kitty and cannot be set manually.");
    case "showReasoning":
      return (rawValue === "true" || rawValue === "1") as AppConfig[keyof AppConfig];
    case "maxOutputTokens":
    case "contextWindowMessages":
    case "maxContextChars":
    case "contextSummaryChars":
    case "maxReadBytes":
    case "commandStallTimeoutMs": {
      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed)) {
        throw new Error(`Expected a number for ${key}.`);
      }

      return parsed as AppConfig[keyof AppConfig];
    }
    case "provider":
    case "profile":
      return rawValue.trim() as AppConfig[keyof AppConfig];
    case "telegram":
    case "extensions": {
      const parsed = tryParseJson(rawValue);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`Expected a JSON object for ${key}.`);
      }

      return parsed as AppConfig[keyof AppConfig];
    }
    default:
      return rawValue as AppConfig[keyof AppConfig];
  }
}

export function extractCliOverrides(options: Record<string, unknown>): CliOverrides {
  return {
    cwd: typeof options.cwd === "string" ? options.cwd : undefined,
    model: typeof options.model === "string" ? options.model : undefined,
  };
}

export function truncateCliValue(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...`;
}

