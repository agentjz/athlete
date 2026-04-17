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

  if (input.forceReasoning || capabilities.defaultReasoningEnabled) {
    body.thinking = { type: "enabled" };
  }

  return body;
}
