import type { AgentIdentity } from "../agent/types.js";
import type { RuntimeConfig } from "../types.js";
import type { AgentModelRole, RuntimeAgentModelConfig, RuntimeAgentModelOverrides } from "./agentModelTypes.js";

const ROLE_PREFIXES: Record<AgentModelRole, string> = {
  lead: "DEADMOUSE_LEAD",
  teammate: "DEADMOUSE_TEAMMATE",
  subagent: "DEADMOUSE_SUBAGENT",
};

export function readRuntimeAgentModels(input: {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  thinking: RuntimeConfig["thinking"];
  reasoningEffort: RuntimeConfig["reasoningEffort"];
}): RuntimeConfig["agentModels"] {
  const overrides = readRuntimeAgentModelOverrides();
  return resolveRuntimeAgentModels(input, overrides);
}

export function readRuntimeAgentModelOverrides(): RuntimeAgentModelOverrides {
  return {
    lead: readRoleModelOverride("lead"),
    teammate: readRoleModelOverride("teammate"),
    subagent: readRoleModelOverride("subagent"),
  };
}

export function resolveRuntimeAgentModels(
  base: RuntimeAgentModelConfig,
  overrides: RuntimeAgentModelOverrides | undefined,
): RuntimeConfig["agentModels"] {
  return {
    lead: resolveRoleModel(base, overrides?.lead),
    teammate: resolveRoleModel(base, overrides?.teammate),
    subagent: resolveRoleModel(base, overrides?.subagent),
  };
}

export function resolveAgentModelConfig(
  config: RuntimeConfig,
  identity: AgentIdentity | undefined,
): RuntimeAgentModelConfig {
  return resolveRuntimeAgentModels(config, config.agentModelOverrides)[resolveAgentModelRole(identity)];
}

function readRoleModelOverride(
  role: AgentModelRole,
): Partial<RuntimeAgentModelConfig> {
  const prefix = ROLE_PREFIXES[role];
  return {
    provider: readTrimmedEnv(`${prefix}_PROVIDER`),
    apiKey: readTrimmedEnv(`${prefix}_API_KEY`),
    baseUrl: readTrimmedEnv(`${prefix}_BASE_URL`),
    model: readTrimmedEnv(`${prefix}_MODEL`),
    thinking: readThinkingEnv(`${prefix}_THINKING`),
    reasoningEffort: readReasoningEffortEnv(`${prefix}_REASONING_EFFORT`),
  };
}

function resolveRoleModel(
  base: RuntimeAgentModelConfig,
  override: Partial<RuntimeAgentModelConfig> | undefined,
): RuntimeAgentModelConfig {
  return {
    provider: override?.provider ?? base.provider,
    apiKey: override?.apiKey ?? base.apiKey,
    baseUrl: override?.baseUrl ?? base.baseUrl,
    model: override?.model ?? base.model,
    thinking: override?.thinking ?? base.thinking,
    reasoningEffort: override?.reasoningEffort ?? base.reasoningEffort,
  };
}

function resolveAgentModelRole(identity: AgentIdentity | undefined): AgentModelRole {
  switch (identity?.kind) {
    case "teammate":
      return "teammate";
    case "subagent":
      return "subagent";
    case "lead":
    default:
      return "lead";
  }
}

function readTrimmedEnv(key: string): string | undefined {
  const normalized = process.env[key]?.trim();
  return normalized ? normalized : undefined;
}

function readThinkingEnv(key: string): RuntimeConfig["thinking"] | undefined {
  switch (readTrimmedEnv(key)?.toLowerCase()) {
    case "enabled":
      return "enabled";
    case "disabled":
      return "disabled";
    default:
      return undefined;
  }
}

function readReasoningEffortEnv(key: string): RuntimeConfig["reasoningEffort"] | undefined {
  switch (readTrimmedEnv(key)?.toLowerCase()) {
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
