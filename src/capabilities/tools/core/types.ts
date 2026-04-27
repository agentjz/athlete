import type { ChatCompletionTool } from "openai/resources/chat/completions";

import type { ChangeStore } from "../../../changes/store.js";
import type { AgentCallbacks, AgentIdentity } from "../../../agent/types.js";
import type { OrchestratorObjective } from "../../../orchestrator/types.js";
import type {
  ProjectContext,
  RuntimeConfig,
  ToolExecutionProtocolMetadata,
  ToolExecutionResult,
} from "../../../types.js";

export type FunctionToolDefinition = Extract<ChatCompletionTool, { type: "function" }>;

export type ToolOriginKind = "builtin" | "mcp" | "host";
export type ToolGovernanceSource = ToolOriginKind;
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
export type ToolGovernanceDocumentKind =
  | "doc"
  | "image"
  | "pdf"
  | "ppt"
  | "spreadsheet";

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
  documentKind?: ToolGovernanceDocumentKind;
}

export interface ToolOrigin {
  kind: ToolOriginKind;
  sourceId?: string;
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

export interface ToolRegistrySource {
  kind: ToolOriginKind;
  id: string;
  tools: readonly RegisteredTool[];
}

export interface ToolRegistry {
  definitions: FunctionToolDefinition[];
  entries?: ToolRegistryEntry[];
  blocked?: ToolRegistryBlockedTool[];
  prepare?: (name: string, rawArgs: string, context: ToolContext) => Promise<ToolRegistryPreparation>;
  runPrepared?: (preparedCall: PreparedToolRegistryCall, context: ToolContext) => Promise<ToolExecutionResult>;
  finalize?: (
    preparedCall: PreparedToolRegistryCall,
    result: ToolExecutionResult,
    options?: {
      status?: ToolExecutionProtocolMetadata["status"];
      blockedIn?: ToolExecutionProtocolMetadata["blockedIn"];
      guardCode?: string;
    },
  ) => ToolExecutionResult;
  execute: (name: string, rawArgs: string, context: ToolContext) => Promise<ToolExecutionResult>;
  close?: () => Promise<void>;
}

export interface ToolRegistryOptions {
  onlyNames?: readonly string[];
  excludeNames?: readonly string[];
  sources?: readonly ToolRegistrySource[];
}

export interface PreparedToolRegistryCall {
  name: string;
  rawArgs: string;
  entry: ToolRegistryEntry;
  execute: RegisteredTool["execute"];
  prepared: unknown;
}

export type ToolRegistryPreparation =
  | {
      ok: true;
      preparedCall: PreparedToolRegistryCall;
    }
  | {
      ok: false;
      preparedCall: PreparedToolRegistryCall;
      result: ToolExecutionResult;
    };

export type ToolRegistryFactory = (options?: ToolRegistryOptions) => ToolRegistry;

export interface ToolContext {
  config: RuntimeConfig;
  cwd: string;
  sessionId: string;
  identity: AgentIdentity;
  callbacks?: AgentCallbacks;
  abortSignal?: AbortSignal;
  projectContext: ProjectContext;
  currentObjective?: OrchestratorObjective;
  changeStore: ChangeStore;
  createToolRegistry: ToolRegistryFactory;
}
