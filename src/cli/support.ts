import path from "node:path";

import type { SessionStore } from "../agent/sessionStore.js";
import { runManagedAgentTurn } from "../agent/managedTurn.js";
import { parseAgentMode, resolveRuntimeConfig } from "../config/store.js";
import type { AgentMode, AppConfig, CliOverrides, RuntimeConfig, SessionRecord } from "../types.js";
import { createStreamRenderer } from "../ui/streamRenderer.js";
import { tryParseJson } from "../utils/json.js";
import { ui } from "../utils/console.js";

export async function resolveCliRuntime(overrides: CliOverrides): Promise<{
  cwd: string;
  config: RuntimeConfig;
  paths: RuntimeConfig["paths"];
  overrides: CliOverrides;
}> {
  const cwd = overrides.cwd ? path.resolve(overrides.cwd) : process.cwd();
  const config = await resolveRuntimeConfig({
    cwd,
    model: overrides.model,
    mode: normalizeModeOverride(overrides.mode),
  });

  return {
    cwd,
    config,
    paths: config.paths,
    overrides,
  };
}

export async function runOneShotPrompt(
  prompt: string,
  cwd: string,
  config: RuntimeConfig,
  session: SessionRecord,
  sessionStore: SessionStore,
): Promise<SessionRecord> {
  const streamRenderer = createStreamRenderer(config, {
    cwd,
    assistantLeadingBlankLine: false,
    assistantTrailingNewlines: "\n",
    reasoningLeadingBlankLine: false,
    toolArgsMaxChars: 160,
    toolErrorLabel: "failed, model will try another path",
  });

  try {
    const result = await runManagedAgentTurn({
      input: prompt,
      cwd,
      config,
      session,
      sessionStore,
      callbacks: streamRenderer.callbacks,
      identity: {
        kind: "lead",
        name: "lead",
      },
    });
    if (result.paused && result.pauseReason) {
      ui.warn(result.pauseReason);
    }
    return result.session;
  } catch (error) {
    streamRenderer.flush();
    throw error;
  }
}

export function coerceConfigValue(key: keyof AppConfig, rawValue: string): AppConfig[keyof AppConfig] {
  switch (key) {
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
      return "deepseek" as AppConfig[keyof AppConfig];
    case "mcp":
    case "telegram": {
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
