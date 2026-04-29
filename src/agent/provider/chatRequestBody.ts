import type { FunctionToolDefinition } from "../../capabilities/tools/index.js";
import { resolveProviderCapabilities } from "../provider.js";
import type { ProviderMessage } from "./contract.js";
import { toChatCompletionMessages } from "./chatCompletionsAdapter.js";

interface BuildProviderRequestBodyInput {
  provider?: string;
  model: string;
  messages: ProviderMessage[];
  tools: FunctionToolDefinition[] | undefined;
  stream: boolean;
  forceReasoning: boolean;
  thinking?: "enabled" | "disabled";
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  maxOutputTokens?: number;
}

export function buildProviderRequestBody(
  input: BuildProviderRequestBodyInput,
): Record<string, unknown> {
  const capabilities = resolveProviderCapabilities(input);
  const thinking = capabilities.provider === "deepseek"
    ? resolveDeepSeekThinking(input.messages, input.thinking ?? "enabled")
    : input.thinking;
  const body: Record<string, unknown> = {
    model: input.model,
    messages: toChatCompletionMessages(input.messages),
    tools: input.tools,
    tool_choice: input.tools?.length ? "auto" : undefined,
    stream: input.stream,
  };

  if (typeof input.maxOutputTokens === "number" && Number.isFinite(input.maxOutputTokens)) {
    body.max_tokens = Math.max(1, Math.trunc(input.maxOutputTokens));
  }

  if (capabilities.provider === "deepseek") {
    body.thinking = { type: thinking };
    if (thinking === "enabled") {
      body.reasoning_effort = normalizeDeepSeekReasoningEffort(input.reasoningEffort ?? capabilities.defaultReasoningEffort);
    }
  } else if (input.forceReasoning || capabilities.defaultReasoningEnabled) {
    body.thinking = { type: "enabled" };
  }

  return body;
}

function resolveDeepSeekThinking(
  messages: ProviderMessage[],
  requested: "enabled" | "disabled",
): "enabled" | "disabled" {
  if (requested === "disabled") {
    return "disabled";
  }

  return hasUnreplayableAssistantReasoning(messages) ? "disabled" : "enabled";
}

function hasUnreplayableAssistantReasoning(messages: ProviderMessage[]): boolean {
  return messages.some((message) =>
    message.role === "assistant" &&
    message.reasoningContent === undefined,
  );
}

function normalizeDeepSeekReasoningEffort(
  effort: "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | undefined,
): "high" | "max" {
  if (effort === undefined || effort === "high" || effort === "max") {
    return effort ?? "high";
  }

  throw new Error(`DeepSeek V4 reasoning_effort must be high or max, received ${effort}`);
}
