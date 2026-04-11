import path from "node:path";

import { AgentTurnError } from "../agent/errors.js";
import type { SessionStore } from "../agent/session.js";
import { runManagedAgentTurn } from "../agent/turn.js";
import { parseAgentMode, resolveRuntimeConfig } from "../config/store.js";
import type {
  AcceptanceState,
  AgentMode,
  AppConfig,
  CliOverrides,
  RuntimeConfig,
  RuntimeTerminalTransition,
  SessionRecord,
  VerificationState,
} from "../types.js";
import { createStreamRenderer } from "../ui/streamRenderer.js";
import { tryParseJson } from "../utils/json.js";
import { ui } from "../utils/console.js";

export interface OneShotCloseoutReport {
  sessionId: string;
  completed: boolean;
  unfinishedReason?: string;
  terminalTransition: RuntimeTerminalTransition | null;
  verification: {
    status: string;
    pendingPaths: string[];
    attempts: number;
    reminderCount: number;
    noProgressCount: number;
  };
  acceptance: {
    status: string;
    phase?: string;
    pendingChecks: string[];
    stalledPhaseCount: number;
  };
}

export interface OneShotPromptRunResult {
  session: SessionRecord;
  closeout: OneShotCloseoutReport;
}

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
): Promise<OneShotPromptRunResult> {
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
    return {
      session: result.session,
      closeout: buildOneShotCloseoutReport(result.session, result.transition ?? null),
    };
  } catch (error) {
    streamRenderer.flush();
    if (error instanceof AgentTurnError) {
      return {
        session: error.session,
        closeout: buildOneShotCloseoutReport(error.session, null, error.message),
      };
    }

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

export function buildOneShotCloseoutReport(
  session: SessionRecord,
  terminalTransition: RuntimeTerminalTransition | null,
  fallbackReason?: string,
): OneShotCloseoutReport {
  const completed = terminalTransition?.action === "finalize";

  return {
    sessionId: session.id,
    completed,
    unfinishedReason: completed ? undefined : terminalTransition?.reason.code ?? fallbackReason ?? "unfinished",
    terminalTransition,
    verification: buildVerificationCloseout(session.verificationState),
    acceptance: buildAcceptanceCloseout(session.acceptanceState),
  };
}

function buildVerificationCloseout(
  state: VerificationState | undefined,
): OneShotCloseoutReport["verification"] {
  return {
    status: state?.status ?? "idle",
    pendingPaths: [...(state?.pendingPaths ?? [])],
    attempts: state?.attempts ?? 0,
    reminderCount: state?.reminderCount ?? 0,
    noProgressCount: state?.noProgressCount ?? 0,
  };
}

function buildAcceptanceCloseout(
  state: AcceptanceState | undefined,
): OneShotCloseoutReport["acceptance"] {
  return {
    status: state?.status ?? "idle",
    phase: state?.currentPhase,
    pendingChecks: [...(state?.pendingChecks ?? [])],
    stalledPhaseCount: state?.stalledPhaseCount ?? 0,
  };
}
