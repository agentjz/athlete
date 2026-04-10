import OpenAI from "openai";
import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

import { collapseContentParts, readReasoningContent } from "./session/messages.js";
import { normalizeAssistantResponse } from "./responseNormalization.js";
import {
  isContentPolicyError,
  isContextLengthError,
  isToolCompatibilityError,
  sanitizeMessagesForContentPolicy,
  shrinkMessagesForContextLimit,
  withApiRetries,
} from "./turn/recovery.js";
import type { ModelRequestMetric, ProviderUsageSnapshot } from "./runtimeMetrics.js";
import { createAbortError, isAbortError, throwIfAborted } from "../utils/abort.js";
import type { AssistantResponse, AgentCallbacks } from "./types.js";
import type { FunctionToolDefinition } from "../tools/index.js";

export async function fetchAssistantResponse(
  client: OpenAI,
  messages: ChatCompletionMessageParam[],
  model: string,
  tools: FunctionToolDefinition[] | undefined,
  callbacks: AgentCallbacks | undefined,
  abortSignal?: AbortSignal,
  onRequestMetric?: (metric: ModelRequestMetric) => void,
): Promise<AssistantResponse> {
  try {
    return await tryFetch(client, messages, model, tools, callbacks, false, abortSignal, onRequestMetric);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    if (model === "deepseek-reasoner" && tools?.length && isToolCompatibilityError(error)) {
      return tryFetch(client, messages, "deepseek-chat", tools, callbacks, true, abortSignal, onRequestMetric);
    }

    if (isContextLengthError(error)) {
      const compactedMessages = shrinkMessagesForContextLimit(messages);
      return tryFetch(client, compactedMessages, model, tools, callbacks, false, abortSignal, onRequestMetric);
    }

    if (!isContentPolicyError(error)) {
      throw error;
    }

    const sanitizedMessages = sanitizeMessagesForContentPolicy(messages);
    return tryFetch(client, sanitizedMessages, model, tools, callbacks, false, abortSignal, onRequestMetric);
  }
}

async function tryFetch(
  client: OpenAI,
  messages: ChatCompletionMessageParam[],
  model: string,
  tools: FunctionToolDefinition[] | undefined,
  callbacks: AgentCallbacks | undefined,
  forceThinking: boolean,
  abortSignal?: AbortSignal,
  onRequestMetric?: (metric: ModelRequestMetric) => void,
): Promise<AssistantResponse> {
  try {
    return normalizeAssistantResponse(await withApiRetries(
      () => fetchAssistantResponseStreaming(client, messages, model, tools, callbacks, forceThinking, abortSignal, onRequestMetric),
      abortSignal,
    ));
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    return normalizeAssistantResponse(await withApiRetries(
      () => fetchAssistantResponseNonStreaming(client, messages, model, tools, forceThinking, abortSignal, onRequestMetric),
      abortSignal,
    ));
  }
}

async function fetchAssistantResponseStreaming(
  client: OpenAI,
  messages: ChatCompletionMessageParam[],
  model: string,
  tools: FunctionToolDefinition[] | undefined,
  callbacks: AgentCallbacks | undefined,
  forceThinking: boolean,
  abortSignal?: AbortSignal,
  onRequestMetric?: (metric: ModelRequestMetric) => void,
): Promise<AssistantResponse> {
  const startedAt = Date.now();
  let usage: ProviderUsageSnapshot | undefined;
  throwIfAborted(abortSignal, "Streaming request aborted");
  try {
    const stream = await client.chat.completions.create(
      {
        ...buildRequestBody(model, messages, tools, true, forceThinking),
        signal: abortSignal,
      } as never,
    );

    if (abortSignal?.aborted) {
      abortStream(stream as { controller?: AbortController });
      throw createAbortError("Streaming aborted");
    }

    let content = "";
    let reasoningContent = "";
    const toolCallParts = new Map<number, { id: string; name: string; arguments: string }>();

    for await (const chunk of stream as unknown as AsyncIterable<{
      usage?: unknown;
      choices?: Array<{
        delta?: {
          content?: string | null;
          reasoning_content?: string | null;
          tool_calls?: Array<{
            index?: number;
            id?: string;
            function?: {
              name?: string;
              arguments?: string;
            };
          }>;
        };
      }>;
    }>) {
      if (abortSignal?.aborted) {
        abortStream(stream as { controller?: AbortController });
        throw createAbortError("Streaming aborted");
      }

      usage = extractProviderUsage(chunk.usage) ?? usage;
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) {
        continue;
      }

      if (typeof delta.content === "string" && delta.content.length > 0) {
        content += delta.content;
        callbacks?.onAssistantDelta?.(delta.content);
      }

      if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
        reasoningContent += delta.reasoning_content;
        callbacks?.onReasoningDelta?.(delta.reasoning_content);
      }

      if (Array.isArray(delta.tool_calls)) {
        for (const toolCall of delta.tool_calls) {
          const index = typeof toolCall.index === "number" ? toolCall.index : 0;
          const existing = toolCallParts.get(index) ?? {
            id: toolCall.id ?? `tool-${index}`,
            name: "",
            arguments: "",
          };

          if (toolCall.id) {
            existing.id = toolCall.id;
          }

          if (toolCall.function?.name) {
            existing.name += toolCall.function.name;
          }

          if (toolCall.function?.arguments) {
            existing.arguments += toolCall.function.arguments;
          }

          toolCallParts.set(index, existing);
        }
      }
    }

    return {
      content: content.length > 0 ? content : null,
      reasoningContent: reasoningContent.length > 0 ? reasoningContent : undefined,
      streamedAssistantContent: content.length > 0,
      streamedReasoningContent: reasoningContent.length > 0,
      toolCalls: [...toolCallParts.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([, toolCall]) => ({
          id: toolCall.id,
          type: "function",
          function: {
            name: toolCall.name,
            arguments: toolCall.arguments,
          },
        })),
    };
  } finally {
    onRequestMetric?.({
      durationMs: Date.now() - startedAt,
      usage,
    });
  }
}

async function fetchAssistantResponseNonStreaming(
  client: OpenAI,
  messages: ChatCompletionMessageParam[],
  model: string,
  tools?: FunctionToolDefinition[],
  forceThinking = false,
  abortSignal?: AbortSignal,
  onRequestMetric?: (metric: ModelRequestMetric) => void,
): Promise<AssistantResponse> {
  const startedAt = Date.now();
  let usage: ProviderUsageSnapshot | undefined;
  throwIfAborted(abortSignal, "Request aborted");
  try {
    const completion = await client.chat.completions.create(
      {
        ...buildRequestBody(model, messages, tools, false, forceThinking),
        signal: abortSignal,
      } as never,
    );
    usage = extractProviderUsage((completion as { usage?: unknown }).usage);

    const message = completion.choices[0]?.message;
    if (!message) {
      throw new Error("API returned no message.");
    }

    return {
      content:
        typeof message.content === "string" ? message.content : collapseContentParts(message.content),
      reasoningContent: readReasoningContent(message),
      streamedAssistantContent: false,
      streamedReasoningContent: false,
      toolCalls: (message.tool_calls ?? [])
        .filter((call): call is ChatCompletionMessageFunctionToolCall => call.type === "function")
        .map((call) => ({
          id: call.id,
          type: "function",
          function: {
            name: call.function.name,
            arguments: call.function.arguments,
          },
        })),
    };
  } finally {
    onRequestMetric?.({
      durationMs: Date.now() - startedAt,
      usage,
    });
  }
}

function buildRequestBody(
  model: string,
  messages: ChatCompletionMessageParam[],
  tools: FunctionToolDefinition[] | undefined,
  stream: boolean,
  forceThinking: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages,
    tools,
    tool_choice: tools?.length ? "auto" : undefined,
    stream,
  };

  if (forceThinking || model === "deepseek-chat") {
    body.thinking = { type: "enabled" };
  }

  return body;
}

function abortStream(stream: { controller?: AbortController } | undefined): void {
  try {
    stream?.controller?.abort();
  } catch {
    // best-effort abort
  }
}

function extractProviderUsage(usage: unknown): ProviderUsageSnapshot | undefined {
  if (!usage || typeof usage !== "object") {
    return undefined;
  }

  const record = usage as {
    prompt_tokens?: unknown;
    input_tokens?: unknown;
    completion_tokens?: unknown;
    output_tokens?: unknown;
    total_tokens?: unknown;
    completion_tokens_details?: { reasoning_tokens?: unknown };
    output_tokens_details?: { reasoning_tokens?: unknown };
  };

  const snapshot: ProviderUsageSnapshot = {
    inputTokens: readUsageNumber(record.prompt_tokens ?? record.input_tokens),
    outputTokens: readUsageNumber(record.completion_tokens ?? record.output_tokens),
    totalTokens: readUsageNumber(record.total_tokens),
    reasoningTokens: readUsageNumber(
      record.completion_tokens_details?.reasoning_tokens ??
      record.output_tokens_details?.reasoning_tokens,
    ),
  };

  return Object.values(snapshot).some((value) => typeof value === "number") ? snapshot : undefined;
}

function readUsageNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}
