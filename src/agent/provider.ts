import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import type { FunctionToolDefinition } from "../tools/index.js";

export interface ProviderCapabilities {
  provider: string;
  model: string;
  supportsReasoningContent: boolean;
  defaultReasoningEnabled: boolean;
  toolCompatibilityFallbackModel?: string;
  recoveryFallback?: {
    consecutiveFailures: number;
    model: string;
  };
}

interface ProviderProfileInput {
  provider?: string;
  model: string;
}

interface BuildProviderRequestBodyInput extends ProviderProfileInput {
  messages: ChatCompletionMessageParam[];
  tools: FunctionToolDefinition[] | undefined;
  stream: boolean;
  forceReasoning: boolean;
}

interface SelectProviderRequestModelInput {
  provider?: string;
  configuredModel: string;
  consecutiveFailures: number;
}

const DEFAULT_PROVIDER = "openai-compatible";

export function resolveProviderCapabilities(input: ProviderProfileInput): ProviderCapabilities {
  const provider = normalizeProviderName(input.provider);
  const model = normalizeModelName(input.model);

  if (provider === "deepseek" || model.startsWith("deepseek-")) {
    const isChatModel = model === "deepseek-chat";
    const isReasonerModel = model === "deepseek-reasoner";

    return {
      provider: "deepseek",
      model,
      supportsReasoningContent: true,
      defaultReasoningEnabled: isChatModel,
      toolCompatibilityFallbackModel: isReasonerModel ? "deepseek-chat" : undefined,
      recoveryFallback: isReasonerModel
        ? {
            consecutiveFailures: 6,
            model: "deepseek-chat",
          }
        : undefined,
    };
  }

  return {
    provider,
    model,
    supportsReasoningContent: false,
    defaultReasoningEnabled: false,
  };
}

export function buildProviderRequestBody(
  input: BuildProviderRequestBodyInput,
): Record<string, unknown> {
  const capabilities = resolveProviderCapabilities(input);
  const body: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
    tools: input.tools,
    tool_choice: input.tools?.length ? "auto" : undefined,
    stream: input.stream,
  };

  if (input.forceReasoning || capabilities.defaultReasoningEnabled) {
    body.thinking = { type: "enabled" };
  }

  return body;
}

export function selectProviderRequestModel(
  input: SelectProviderRequestModelInput,
): string {
  const capabilities = resolveProviderCapabilities({
    provider: input.provider,
    model: input.configuredModel,
  });

  if (
    capabilities.recoveryFallback &&
    input.consecutiveFailures >= capabilities.recoveryFallback.consecutiveFailures
  ) {
    return capabilities.recoveryFallback.model;
  }

  return input.configuredModel;
}

function normalizeProviderName(value: string | undefined): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || DEFAULT_PROVIDER;
}

function normalizeModelName(value: string): string {
  return String(value ?? "").trim();
}
