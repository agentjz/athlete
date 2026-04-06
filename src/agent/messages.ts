import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import type { ExternalizedToolResultReference, StoredMessage, ToolCallRecord } from "../types.js";

export function buildChatMessages(
  systemPrompt: string,
  messages: StoredMessage[],
  contextWindowMessages: number,
  model: string,
): ChatCompletionMessageParam[] {
  const recentMessages = messages.slice(-contextWindowMessages);

  return [
    {
      role: "system",
      content: systemPrompt,
    },
    ...recentMessages.map((message, index) =>
      toChatMessage(message, {
        includeReasoning: shouldIncludeStoredAssistantReasoning(recentMessages, index, model),
      }),
    ),
  ];
}

export function createMessage(
  role: StoredMessage["role"],
  content: string | null,
  options: {
    reasoningContent?: string;
    toolCalls?: ToolCallRecord[];
    name?: string;
  } = {},
): StoredMessage {
  return {
    role,
    content,
    name: options.name,
    tool_calls: options.toolCalls,
    reasoningContent: options.reasoningContent,
    createdAt: new Date().toISOString(),
  };
}

export function createToolMessage(
  toolCallId: string,
  content: string,
  name: string,
  options: {
    externalizedToolResult?: ExternalizedToolResultReference;
  } = {},
): StoredMessage {
  return {
    role: "tool",
    content,
    tool_call_id: toolCallId,
    name,
    externalizedToolResult: options.externalizedToolResult,
    createdAt: new Date().toISOString(),
  };
}

export function readReasoningContent(message: unknown): string | undefined {
  const candidate = (message as { reasoning_content?: unknown }).reasoning_content;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

export function collapseContentParts(content: unknown): string | null {
  if (!Array.isArray(content)) {
    return null;
  }

  const fragments = content
    .map((part) => {
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }

      return "";
    })
    .filter(Boolean);

  return fragments.length > 0 ? fragments.join("") : null;
}

export function toChatMessage(
  message: StoredMessage,
  options: { includeReasoning: boolean },
): ChatCompletionMessageParam {
  if (message.role === "tool") {
    return {
      role: "tool",
      content: message.content ?? "",
      tool_call_id: message.tool_call_id ?? "",
    };
  }

  if (message.role === "assistant" && message.tool_calls?.length) {
    const assistantMessage: Record<string, unknown> = {
      role: "assistant",
      content: message.content,
      tool_calls: message.tool_calls,
    };

    if (options.includeReasoning && message.reasoningContent) {
      assistantMessage.reasoning_content = message.reasoningContent;
    }

    return assistantMessage as unknown as ChatCompletionMessageParam;
  }

  const baseMessage: Record<string, unknown> = {
    role: message.role,
    content: message.content ?? "",
    name: message.name,
  };

  if (message.role === "assistant" && options.includeReasoning && message.reasoningContent) {
    baseMessage.reasoning_content = message.reasoningContent;
  }

  return baseMessage as unknown as ChatCompletionMessageParam;
}

export function findLatestUserIndex<T extends { role: string }>(messages: T[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      return index;
    }
  }

  return -1;
}

export function expandStartToToolBoundary<T extends { role: string; tool_calls?: unknown }>(
  messages: T[],
  startIndex: number,
): number {
  let index = Math.max(0, Math.min(startIndex, messages.length - 1));

  while (index > 0 && messages[index]?.role === "tool") {
    index -= 1;
  }

  return index;
}

export function modelUsesReasoningContent(model: string): boolean {
  return model === "deepseek-reasoner" || model === "deepseek-chat";
}

export function isAssistantMessageInLatestTurn<T extends { role: string }>(
  messages: T[],
  index: number,
): boolean {
  return messages[index]?.role === "assistant" && index > findLatestUserIndex(messages);
}

export function shouldIncludeStoredAssistantReasoning(
  messages: StoredMessage[],
  index: number,
  model: string,
): boolean {
  return (
    modelUsesReasoningContent(model) &&
    isAssistantMessageInLatestTurn(messages, index) &&
    Boolean(messages[index]?.reasoningContent)
  );
}
