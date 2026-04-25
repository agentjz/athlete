import type { ModelReasoningEffort } from "../types.js";

export type AgentModelRole = "lead" | "teammate" | "subagent";

export interface RuntimeAgentModelConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  reasoningEffort?: ModelReasoningEffort;
}

export type RuntimeAgentModelOverrides = Partial<Record<AgentModelRole, Partial<RuntimeAgentModelConfig>>>;

export interface RuntimeAgentModelRuntime {
  apiKey: string;
  agentModels: Record<AgentModelRole, RuntimeAgentModelConfig>;
  agentModelOverrides?: RuntimeAgentModelOverrides;
}
