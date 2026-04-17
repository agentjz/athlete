import type OpenAI from "openai";
import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

import { collapseContentParts, readReasoningContent } from "../session/messages.js";
import { buildProviderRequestBody } from "./chatRequestBody.js";
import type { ProviderAdapterRequest, ProviderMessage, ProviderWireAdapter } from "./contract.js";
import type { ProviderUsageSnapshot } from "../runtimeMetrics.js";
import { createAbortError, throwIfAborted } from "../../utils/abort.js";

export const chatCompletionsAdapter: ProviderWireAdapter = {
  wireApi: "chat.completions",
  async fetchStreaming(client: OpenAI, request: ProviderAdapterRequest) {
    const startedAt = Date.now();
    let usage: ProviderUsageSnapshot | undefined;
    throwIfAborted(request.abortSignal, "Streaming request aborted");
    try {
      const stream = await client.chat.completions.create(
        {
          ...buildProviderRequestBody({
            provider: request.provider,
            model: request.model,
            messages: request.messages,
            tools: request.tools,
            stream: true,
            forceReasoning: request.forceReasoning,
          }),
          signal: request.abortSignal,
        } as never,
      );

      if (request.abortSignal?.aborted) {
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
        if (request.abortSignal?.aborted) {
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
          request.callbacks?.onAssistantDelta?.(delta.content);
        }

        if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
          reasoningContent += delta.reasoning_content;
          request.callbacks?.onReasoningDelta?.(delta.reasoning_content);
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
      request.onRequestMetric?.({
        durationMs: Date.now() - startedAt,
        usage,
      });
    }
  },
  async fetchNonStreaming(client: OpenAI, request: ProviderAdapterRequest) {
    const startedAt = Date.now();
    let usage: ProviderUsageSnapshot | undefined;
    throwIfAborted(request.abortSignal, "Request aborted");
    try {
      const completion = await client.chat.completions.create(
        {
          ...buildProviderRequestBody({
            provider: request.provider,
            model: request.model,
            messages: request.messages,
            tools: request.tools,
            stream: false,
            forceReasoning: request.forceReasoning,
          }),
          signal: request.abortSignal,
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
      request.onRequestMetric?.({
        durationMs: Date.now() - startedAt,
        usage,
      });
    }
  },
};

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

export function toChatCompletionMessages(messages: ProviderMessage[]): ChatCompletionMessageParam[] {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        content: message.content ?? "",
        tool_call_id: message.toolCallId ?? "",
      };
    }

    if (message.role === "assistant" && message.toolCalls?.length) {
      const assistantMessage: Record<string, unknown> = {
        role: "assistant",
        content: message.content,
        tool_calls: message.toolCalls,
      };

      if (message.reasoningContent) {
        assistantMessage.reasoning_content = message.reasoningContent;
      }

      return assistantMessage as unknown as ChatCompletionMessageParam;
    }

    const baseMessage: Record<string, unknown> = {
      role: message.role,
      content: message.content ?? "",
      name: message.name,
    };

    if (message.role === "assistant" && message.reasoningContent) {
      baseMessage.reasoning_content = message.reasoningContent;
    }

    return baseMessage as unknown as ChatCompletionMessageParam;
  });
}
