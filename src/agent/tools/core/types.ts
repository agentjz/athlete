import type { ChatCompletionTool } from "openai/resources/chat/completions";

import type { ChangeStore } from "../../../agent/changes/store.js";
import type { AgentCallbacks, AgentIdentity } from "../../../agent/types.js";
import type {
  ProjectContext,
  RuntimeConfig,
  ToolExecutionProtocolMetadata,
  ToolExecutionResult,
} from "../../../types.js";

export type FunctionToolDefinition = Extract<ChatCompletionTool, { type: "function" }>;

export type ToolOriginKind = "builtin" | "host";
export type ToolGovernanceSource = ToolOriginKind;
export type ToolGovernanceSpecialty =
  | "filesystem"
  | "shell";
export type ToolGovernanceMutation = "read" | "state" | "write";
export type ToolGovernanceRisk = "low" | "medium" | "high";
export type ToolChangeSignal = "none" | "required";

export interface ToolGovernance {
  source: ToolGovernanceSource;
  specialty: ToolGovernanceSpecialty;
  mutation: ToolGovernanceMutation;
  risk: ToolGovernanceRisk;
  destructive: boolean;
  concurrencySafe: boolean;
  changeSignal: ToolChangeSignal;
}

export interface ToolOrigin {
  kind: ToolOriginKind;
  sourceId?: string;
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
  changeStore: ChangeStore;
  createToolRegistry: ToolRegistryFactory;
}
