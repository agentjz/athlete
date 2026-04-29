import type OpenAI from "openai";

import type { FunctionToolDefinition } from "../../capabilities/tools/index.js";
import type { ModelReasoningEffort, ToolCallRecord } from "../../types.js";
import type { AgentCallbacks, AssistantResponse } from "../types.js";
import type { ModelRequestMetric } from "../runtimeMetrics.js";

export interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCallRecord[];
  reasoningContent?: string;
}

export interface ProviderAdapterRequest {
  provider: string;
  model: string;
  messages: ProviderMessage[];
  tools: FunctionToolDefinition[] | undefined;
  callbacks: AgentCallbacks | undefined;
  forceReasoning: boolean;
  thinking?: "enabled" | "disabled";
  reasoningEffort?: ModelReasoningEffort;
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
  onRequestMetric?: (metric: ModelRequestMetric) => void;
}

export interface ProviderWireAdapter {
  wireApi: "responses" | "chat.completions";
  fetchStreaming(client: OpenAI, request: ProviderAdapterRequest): Promise<AssistantResponse>;
  fetchNonStreaming(client: OpenAI, request: ProviderAdapterRequest): Promise<AssistantResponse>;
}
