import type { FunctionToolDefinition } from "../../tools/index.js";
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
}

export function buildProviderRequestBody(
  input: BuildProviderRequestBodyInput,
): Record<string, unknown> {
  const capabilities = resolveProviderCapabilities(input);
  const body: Record<string, unknown> = {
    model: input.model,
    messages: toChatCompletionMessages(input.messages),
    tools: input.tools,
    tool_choice: input.tools?.length ? "auto" : undefined,
    stream: input.stream,
  };

  if (capabilities.provider === "deepseek") {
    const thinking = input.thinking ?? "enabled";
    body.thinking = { type: thinking };
    if (thinking === "enabled") {
      body.reasoning_effort = normalizeDeepSeekReasoningEffort(input.reasoningEffort ?? capabilities.defaultReasoningEffort);
    }
  } else if (input.forceReasoning || capabilities.defaultReasoningEnabled) {
    body.thinking = { type: "enabled" };
  }

  return body;
}

function normalizeDeepSeekReasoningEffort(
  effort: "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | undefined,
): "high" | "max" {
  if (effort === undefined || effort === "high" || effort === "max") {
    return effort ?? "high";
  }

  throw new Error(`DeepSeek V4 reasoning_effort must be high or max, received ${effort}`);
}
