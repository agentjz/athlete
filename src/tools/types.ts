import type { ChatCompletionTool } from "openai/resources/chat/completions";

import type { ChangeStore } from "../changes/store.js";
import type { AgentCallbacks, AgentIdentity } from "../agent/types.js";
import type { AgentMode, ProjectContext, RuntimeConfig, ToolExecutionResult } from "../types.js";

export type FunctionToolDefinition = Extract<ChatCompletionTool, { type: "function" }>;

export type ToolGovernanceSource = "builtin" | "mcp";
export type ToolGovernanceSpecialty =
  | "background"
  | "browser"
  | "document"
  | "external"
  | "filesystem"
  | "messaging"
  | "shell"
  | "task"
  | "team"
  | "worktree";
export type ToolGovernanceMutation = "read" | "state" | "write";
export type ToolGovernanceRisk = "low" | "medium" | "high";
export type ToolGovernanceSignal = "none" | "optional" | "required";
export type ToolGovernanceBrowserStep =
  | "navigate"
  | "snapshot"
  | "take_screenshot"
  | "click"
  | "type"
  | "other";

export interface ToolGovernance {
  source: ToolGovernanceSource;
  specialty: ToolGovernanceSpecialty;
  mutation: ToolGovernanceMutation;
  risk: ToolGovernanceRisk;
  destructive: boolean;
  concurrencySafe: boolean;
  changeSignal: ToolGovernanceSignal;
  verificationSignal: ToolGovernanceSignal;
  preferredWorkflows: readonly string[];
  fallbackOnlyInWorkflows: readonly string[];
  browserStep?: ToolGovernanceBrowserStep;
}

export interface ToolOrigin {
  kind: "builtin" | "mcp";
  serverName?: string;
  toolName?: string;
  readOnlyHint?: boolean;
}

export interface RegisteredTool {
  definition: FunctionToolDefinition;
  execute: (rawArgs: string, context: ToolContext) => Promise<ToolExecutionResult>;
  governance?: Partial<ToolGovernance>;
  origin?: ToolOrigin;
}

export interface ToolRegistryEntry {
  name: string;
  definition: FunctionToolDefinition;
  governance: ToolGovernance;
  origin: ToolOrigin;
  tool: RegisteredTool;
}

export interface ToolRegistryBlockedTool {
  name: string;
  reason: string;
  origin?: ToolOrigin;
}

export interface ToolRegistry {
  definitions: FunctionToolDefinition[];
  entries?: ToolRegistryEntry[];
  blocked?: ToolRegistryBlockedTool[];
  execute: (name: string, rawArgs: string, context: ToolContext) => Promise<ToolExecutionResult>;
  close?: () => Promise<void>;
}

export interface ToolRegistryOptions {
  onlyNames?: readonly string[];
  excludeNames?: readonly string[];
  includeTools?: readonly RegisteredTool[];
}

export type ToolRegistryFactory = (mode: AgentMode, options?: ToolRegistryOptions) => ToolRegistry;

export interface ToolContext {
  config: RuntimeConfig;
  cwd: string;
  sessionId: string;
  identity: AgentIdentity;
  callbacks?: AgentCallbacks;
  abortSignal?: AbortSignal;
  projectContext: ProjectContext;
  changeStore: ChangeStore;
  createToolRegistry: ToolRegistryFactory;
}
