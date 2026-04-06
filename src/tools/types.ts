import type { ChatCompletionTool } from "openai/resources/chat/completions";

import type { ChangeStore } from "../changes/store.js";
import type { AgentCallbacks, AgentIdentity } from "../agent/types.js";
import type { AgentMode, ProjectContext, RuntimeConfig, ToolExecutionResult } from "../types.js";

export type FunctionToolDefinition = Extract<ChatCompletionTool, { type: "function" }>;

export interface RegisteredTool {
  definition: FunctionToolDefinition;
  execute: (rawArgs: string, context: ToolContext) => Promise<ToolExecutionResult>;
}

export interface ToolRegistry {
  definitions: FunctionToolDefinition[];
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
