import type { ChatCompletionTool } from "openai/resources/chat/completions";

import type { ChangeStore } from "../../agent/changes/store.js";
import type { AgentCallbacks, AgentIdentity } from "../../agent/types.js";
import type {
  ProjectContext,
  RuntimeConfig,
  TodoItem,
  ToolExecutionResult,
} from "../../types.js";

export type FunctionToolDefinition = Extract<ChatCompletionTool, { type: "function" }>;

export type ToolOriginKind = "builtin" | "host";
export type ToolChangeSignal = "none" | "required";

export interface ToolOrigin {
  kind: ToolOriginKind;
  sourceId?: string;
}

export interface RegisteredTool {
  definition: FunctionToolDefinition;
  execute: (rawArgs: string, context: ToolContext) => Promise<ToolExecutionResult>;
  changeSignal?: ToolChangeSignal;
  origin?: ToolOrigin;
}

export interface ToolRegistryEntry {
  name: string;
  definition: FunctionToolDefinition;
  changeSignal?: ToolChangeSignal;
  origin: ToolOrigin;
  tool: RegisteredTool;
}

export interface ToolRegistrySource {
  kind: ToolOriginKind;
  id: string;
  tools: readonly RegisteredTool[];
}

export interface ToolRegistry {
  definitions: FunctionToolDefinition[];
  entries?: ToolRegistryEntry[];
  execute: (name: string, rawArgs: string, context: ToolContext) => Promise<ToolExecutionResult>;
  close?: () => Promise<void>;
}

export interface ToolRegistryOptions {
  onlyNames?: readonly string[];
  excludeNames?: readonly string[];
  builtinToolFilter?: ToolFilter;
  sources?: readonly ToolRegistrySource[];
}

export type ToolFilter = (tool: RegisteredTool) => boolean;

export type ToolRegistryFactory = (options?: ToolRegistryOptions) => ToolRegistry;

export interface ToolContext {
  config: RuntimeConfig;
  cwd: string;
  sessionId: string;
  identity: AgentIdentity;
  callbacks?: AgentCallbacks;
  abortSignal?: AbortSignal;
  runtimeState?: {
    todoItems?: TodoItem[];
  };
  projectContext: ProjectContext;
  changeStore: ChangeStore;
  createToolRegistry: ToolRegistryFactory;
}
