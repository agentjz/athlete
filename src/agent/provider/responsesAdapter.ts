import type OpenAI from "openai";

import { resolveProviderCapabilities } from "../provider.js";
import type { ProviderUsageSnapshot } from "../runtimeMetrics.js";
import type { ProviderAdapterRequest, ProviderMessage, ProviderWireAdapter } from "./contract.js";
import { createAbortError, throwIfAborted } from "../../utils/abort.js";

export const responsesAdapter: ProviderWireAdapter = {
  wireApi: "responses",
  async fetchStreaming(client: OpenAI, request: ProviderAdapterRequest) {
    const startedAt = Date.now();
    let usage: ProviderUsageSnapshot | undefined;
    throwIfAborted(request.abortSignal, "Streaming request aborted");
    try {
      const stream = await client.responses.create(
        {
          ...buildResponsesRequestBody(request),
          stream: true,
        } as never,
        {
          signal: request.abortSignal,
        },
      );

      if (request.abortSignal?.aborted) {
        abortStream(stream as { controller?: AbortController });
        throw createAbortError("Streaming aborted");
      }

      let content = "";
      let reasoningContent = "";
      const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();

      for await (const event of stream as unknown as AsyncIterable<{
        type?: string;
        delta?: string;
        item_id?: string;
        output_index?: number;
        name?: string;
        arguments?: string;
        item?: {
          id?: string;
          type?: string;
          call_id?: string;
          name?: string;
          arguments?: string;
        };
        response?: {
          usage?: unknown;
        };
      }>) {
        if (request.abortSignal?.aborted) {
          abortStream(stream as { controller?: AbortController });
          throw createAbortError("Streaming aborted");
        }

        usage = extractProviderUsage(event.response?.usage) ?? usage;

        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          content += event.delta;
          request.callbacks?.onAssistantDelta?.(event.delta);
          continue;
        }

        if (
          (event.type === "response.reasoning_text.delta" || event.type === "response.reasoning_summary_text.delta") &&
          typeof event.delta === "string"
        ) {
          reasoningContent += event.delta;
          request.callbacks?.onReasoningDelta?.(event.delta);
          continue;
        }

        if (event.type === "response.function_call_arguments.delta" && typeof event.delta === "string") {
          const index = typeof event.output_index === "number" ? event.output_index : 0;
          const existing = toolCalls.get(index) ?? {
            id: event.item_id ?? `tool-${index}`,
            name: "",
            arguments: "",
          };
          existing.arguments += event.delta;
          toolCalls.set(index, existing);
          continue;
        }

        if (event.type === "response.function_call_arguments.done") {
          const index = typeof event.output_index === "number" ? event.output_index : 0;
          const existing = toolCalls.get(index) ?? {
            id: event.item_id ?? `tool-${index}`,
            name: "",
            arguments: "",
          };
          if (typeof event.name === "string") {
            existing.name = event.name;
          }
          if (typeof event.arguments === "string" && event.arguments.length > 0) {
            existing.arguments = event.arguments;
          }
          toolCalls.set(index, existing);
          continue;
        }

        if (event.type === "response.output_item.done" && event.item?.type === "function_call") {
          const index = typeof event.output_index === "number" ? event.output_index : 0;
          toolCalls.set(index, {
            id: event.item.call_id ?? event.item.id ?? `tool-${index}`,
            name: event.item.name ?? "",
            arguments: event.item.arguments ?? "",
          });
        }
      }

      return {
        content: content.length > 0 ? content : null,
        reasoningContent: reasoningContent.length > 0 ? reasoningContent : undefined,
        streamedAssistantContent: content.length > 0,
        streamedReasoningContent: reasoningContent.length > 0,
        toolCalls: [...toolCalls.entries()]
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
      const response = await client.responses.create(
        {
          ...buildResponsesRequestBody(request),
          stream: false,
        } as never,
        {
          signal: request.abortSignal,
        },
      );
      usage = extractProviderUsage((response as { usage?: unknown }).usage);

      return {
        content: normalizeOutputText(response),
        reasoningContent: readResponseReasoning(response),
        streamedAssistantContent: false,
        streamedReasoningContent: false,
        toolCalls: readResponseToolCalls(response),
      };
    } finally {
      request.onRequestMetric?.({
        durationMs: Date.now() - startedAt,
        usage,
      });
    }
  },
};

function buildResponsesRequestBody(request: ProviderAdapterRequest): Record<string, unknown> {
  const capabilities = resolveProviderCapabilities({
    provider: request.provider,
    model: request.model,
  });

  const body: Record<string, unknown> = {
    model: request.model,
    input: toResponsesInput(request.messages),
    tools: request.tools?.map((tool) => ({
      type: "function",
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters ?? null,
      strict: false,
    })),
    tool_choice: request.tools?.length ? "auto" : undefined,
  };

  const reasoningEffort = request.reasoningEffort ?? capabilities.defaultReasoningEffort;
  if (request.forceReasoning || capabilities.defaultReasoningEnabled || reasoningEffort) {
    body.reasoning = {
      effort: reasoningEffort ?? "high",
      summary: "detailed",
    };
  }

  return body;
}

function toResponsesInput(messages: ProviderMessage[]): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [];

  for (const message of messages) {
    if (message.role === "tool") {
      items.push({
        type: "function_call_output",
        call_id: message.toolCallId ?? "",
        output: message.content ?? "",
      });
      continue;
    }

    if (message.role === "assistant" && message.toolCalls?.length) {
      if (typeof message.content === "string" && message.content.trim().length > 0) {
        items.push({
          type: "message",
          role: "assistant",
          content: message.content,
        });
      }

      for (const toolCall of message.toolCalls) {
        items.push({
          type: "function_call",
          call_id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        });
      }
      continue;
    }

    items.push({
      type: "message",
      role: message.role,
      content: message.content ?? "",
    });
  }

  return items;
}

function normalizeOutputText(response: unknown): string | null {
  const outputText = (response as { output_text?: unknown }).output_text;
  if (typeof outputText === "string" && outputText.trim().length > 0) {
    return outputText;
  }

  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return null;
  }

  const fragments = output.flatMap((item) => {
    if (!item || typeof item !== "object" || (item as { type?: unknown }).type !== "message") {
      return [];
    }

    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      return [];
    }

    return content.flatMap((part) => {
      if (!part || typeof part !== "object" || (part as { type?: unknown }).type !== "output_text") {
        return [];
      }

      return typeof (part as { text?: unknown }).text === "string"
        ? [(part as { text: string }).text]
        : [];
    });
  });

  return fragments.length > 0 ? fragments.join("") : null;
}

function readResponseToolCalls(response: unknown) {
  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return [];
  }

  return output
    .filter((item): item is {
      id?: string;
      type: "function_call";
      call_id?: string;
      name?: string;
      arguments?: string;
    } => Boolean(item) && typeof item === "object" && (item as { type?: unknown }).type === "function_call")
    .map((item) => ({
      id: item.call_id ?? item.id ?? crypto.randomUUID(),
      type: "function" as const,
      function: {
        name: item.name ?? "",
        arguments: item.arguments ?? "",
      },
    }));
}

function readResponseReasoning(response: unknown): string | undefined {
  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return undefined;
  }

  const fragments = output.flatMap((item) => {
    if (!item || typeof item !== "object" || (item as { type?: unknown }).type !== "reasoning") {
      return [];
    }

    const reasoningItem = item as {
      summary?: Array<{ text?: unknown }>;
      content?: Array<{ text?: unknown }>;
    };
    const summary = Array.isArray(reasoningItem.summary)
      ? reasoningItem.summary
        .map((entry) => (typeof entry?.text === "string" ? entry.text : ""))
        .filter(Boolean)
      : [];
    const content = Array.isArray(reasoningItem.content)
      ? reasoningItem.content
        .map((entry) => (typeof entry?.text === "string" ? entry.text : ""))
        .filter(Boolean)
      : [];
    return [...content, ...summary];
  });

  return fragments.length > 0 ? fragments.join("") : undefined;
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
