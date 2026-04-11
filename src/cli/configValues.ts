import { parseAgentMode } from "../config/schema.js";
import type { AgentMode, AppConfig, CliOverrides } from "../types.js";
import { tryParseJson } from "../utils/json.js";

export const APP_CONFIG_KEYS = [
  "schemaVersion",
  "provider",
  "baseUrl",
  "model",
  "mode",
  "allowedRoots",
  "yieldAfterToolSteps",
  "contextWindowMessages",
  "maxContextChars",
  "contextSummaryChars",
  "maxToolIterations",
  "maxContinuationBatches",
  "maxReadBytes",
  "maxSearchResults",
  "maxSpreadsheetPreviewRows",
  "maxSpreadsheetPreviewColumns",
  "commandStallTimeoutMs",
  "commandMaxRetries",
  "commandRetryBackoffMs",
  "showReasoning",
  "mcp",
  "telegram",
  "weixin",
] as const satisfies ReadonlyArray<keyof AppConfig>;

const KNOWN_CONFIG_KEYS = new Set<keyof AppConfig>(APP_CONFIG_KEYS);
const MUTABLE_CONFIG_KEYS = new Set<keyof AppConfig>([
  "provider",
  "baseUrl",
  "model",
  "mode",
  "allowedRoots",
  "yieldAfterToolSteps",
  "contextWindowMessages",
  "maxContextChars",
  "contextSummaryChars",
  "maxToolIterations",
  "maxContinuationBatches",
  "maxReadBytes",
  "maxSearchResults",
  "maxSpreadsheetPreviewRows",
  "maxSpreadsheetPreviewColumns",
  "commandStallTimeoutMs",
  "commandMaxRetries",
  "commandRetryBackoffMs",
  "showReasoning",
  "mcp",
  "telegram",
  "weixin",
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
      throw new Error("schemaVersion is managed by Athlete and cannot be set manually.");
    case "allowedRoots": {
      const parsed = tryParseJson(rawValue);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item)) as AppConfig[keyof AppConfig];
      }

      return rawValue
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean) as AppConfig[keyof AppConfig];
    }
    case "showReasoning":
      return (rawValue === "true" || rawValue === "1") as AppConfig[keyof AppConfig];
    case "contextWindowMessages":
    case "maxContextChars":
    case "contextSummaryChars":
    case "yieldAfterToolSteps":
    case "maxToolIterations":
    case "maxContinuationBatches":
    case "maxReadBytes":
    case "maxSearchResults":
    case "maxSpreadsheetPreviewRows":
    case "maxSpreadsheetPreviewColumns":
    case "commandStallTimeoutMs":
    case "commandMaxRetries":
    case "commandRetryBackoffMs": {
      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed)) {
        throw new Error(`Expected a number for ${key}.`);
      }

      return parsed as AppConfig[keyof AppConfig];
    }
    case "mode": {
      const parsed = parseAgentMode(rawValue);
      if (!parsed) {
        throw new Error(`Invalid mode: ${rawValue}`);
      }

      return parsed as AppConfig[keyof AppConfig];
    }
    case "provider":
      return rawValue.trim() as AppConfig[keyof AppConfig];
    case "mcp":
    case "telegram":
    case "weixin": {
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
    mode: normalizeModeOverride(typeof options.mode === "string" ? options.mode : (options.mode as AgentMode | undefined)),
  };
}

export function truncateCliValue(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...`;
}

function normalizeModeOverride(value: string | AgentMode | undefined): AgentMode | undefined {
  return typeof value === "string" ? parseAgentMode(value) : value;
}
