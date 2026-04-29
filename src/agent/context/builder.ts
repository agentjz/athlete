import { expandStartToToolBoundary, shouldIncludeStoredAssistantReasoning } from "../session/messages.js";
import { createPromptContextDiagnostics } from "../prompt/requestDiagnostics.js";
import { measurePromptLayers, renderPromptLayers } from "../promptSections.js";
import { compactToolPayload } from "../toolResults/preview.js";
import { findLatestUserInputIndex, isInternalMessage, sliceCurrentUserInputFrame } from "../session/turnFrame.js";
import type { ProviderMessage } from "../provider/contract.js";
import type { PromptLayerMetrics, PromptLayers } from "../promptSections.js";
import type { RuntimeConfig, StoredMessage } from "../../types.js";
import type { PromptContextDiagnostics } from "../prompt/requestDiagnostics.js";

const MIN_TAIL_MESSAGES = 8;
const DETAILED_RECENT_MESSAGES = 8;
const MAX_SUMMARY_MESSAGE_COUNT = 48;

export interface BuiltRequestContext {
  messages: ProviderMessage[];
  compressed: boolean;
  estimatedChars: number;
  summary?: string;
  promptMetrics?: PromptLayerMetrics;
  contextDiagnostics: PromptContextDiagnostics;
}

export function buildRequestContext(
  systemPrompt: string | PromptLayers,
  messages: StoredMessage[],
  config: Pick<RuntimeConfig, "contextWindowMessages" | "model" | "maxContextChars" | "contextSummaryChars">,
): BuiltRequestContext {
  const safeMaxChars = Math.max(8_000, config.maxContextChars);
  const frameMessages = sliceCurrentUserInputFrame(messages);
  const initialEstimatedChars = estimateChatMessagesChars(composeChatMessages(systemPrompt, frameMessages, config.model));
  let tailCount = Math.max(1, Math.min(frameMessages.length, config.contextWindowMessages));

  while (true) {
    const tailMessages = sliceTailMessages(frameMessages, tailCount);
    const compressedFrameHead = frameMessages.slice(0, Math.max(0, frameMessages.length - tailMessages.length));
    const summary =
      compressedFrameHead.length > 0
        ? summarizeConversation(compressedFrameHead, config.contextSummaryChars)
        : undefined;
    const summaryPrompt = appendSummary(systemPrompt, summary);

    let workingTail = compactTailMessages(tailMessages, false);
    let requestMessages = composeChatMessages(summaryPrompt, workingTail, config.model);
    let estimatedChars = estimateChatMessagesChars(requestMessages);
    let promptMetrics = measureSystemPrompt(summaryPrompt);

    if (estimatedChars <= safeMaxChars) {
      return {
        messages: requestMessages,
        compressed: Boolean(summary),
        estimatedChars,
        summary,
        promptMetrics,
        contextDiagnostics: createPromptContextDiagnostics({
          maxContextChars: safeMaxChars,
          initialEstimatedChars,
          finalEstimatedChars: estimatedChars,
          summaryChars: summary?.length,
          tailMessageCount: tailMessages.length,
          compactedTail: false,
        }),
      };
    }

    workingTail = compactTailMessages(tailMessages, true);
    requestMessages = composeChatMessages(summaryPrompt, workingTail, config.model);
    estimatedChars = estimateChatMessagesChars(requestMessages);
    promptMetrics = measureSystemPrompt(summaryPrompt);

    if (estimatedChars <= safeMaxChars) {
      return {
        messages: requestMessages,
        compressed: true,
        estimatedChars,
        summary,
        promptMetrics,
        contextDiagnostics: createPromptContextDiagnostics({
          maxContextChars: safeMaxChars,
          initialEstimatedChars,
          finalEstimatedChars: estimatedChars,
          summaryChars: summary?.length,
          tailMessageCount: tailMessages.length,
          compactedTail: true,
        }),
      };
    }

    if (tailCount > MIN_TAIL_MESSAGES) {
      tailCount = Math.max(MIN_TAIL_MESSAGES, tailCount - 4);
      continue;
    }

    const lastResortSummary = summary
      ? truncate(summary, Math.max(1_200, Math.floor(config.contextSummaryChars * 0.6)))
      : undefined;
    const lastResortTail = sliceTailMessages(frameMessages, MIN_TAIL_MESSAGES);
    const lastResortMessages = composeChatMessages(
      appendSummary(systemPrompt, lastResortSummary),
      compactTailMessages(lastResortTail, true),
      config.model,
    );

    return {
      messages: lastResortMessages,
      compressed: true,
      estimatedChars: estimateChatMessagesChars(lastResortMessages),
      summary: lastResortSummary,
      promptMetrics: measureSystemPrompt(appendSummary(systemPrompt, lastResortSummary)),
      contextDiagnostics: createPromptContextDiagnostics({
        maxContextChars: safeMaxChars,
        initialEstimatedChars,
        finalEstimatedChars: estimateChatMessagesChars(lastResortMessages),
        summaryChars: lastResortSummary?.length,
        tailMessageCount: lastResortTail.length,
        compactedTail: true,
      }),
    };
  }
}

function sliceTailMessages(messages: StoredMessage[], tailCount: number): StoredMessage[] {
  if (messages.length === 0) {
    return [];
  }

  const startIndex = Math.max(0, messages.length - tailCount);
  const safeStartIndex = expandStartToToolBoundary(messages, startIndex);
  return messages.slice(safeStartIndex);
}

function composeChatMessages(
  systemPrompt: string | PromptLayers,
  messages: StoredMessage[],
  model: string,
): ProviderMessage[] {
  return [
    {
      role: "system",
      content: renderSystemPrompt(systemPrompt),
    },
    ...messages.map((message, index) => ({
      role: message.role,
      content: message.content,
      name: message.name,
      toolCallId: message.tool_call_id,
      toolCalls: message.tool_calls,
      reasoningContent: shouldIncludeStoredAssistantReasoning(messages, index, model)
        ? message.reasoningContent
        : undefined,
    })),
  ];
}

function compactTailMessages(messages: StoredMessage[], aggressive: boolean): StoredMessage[] {
  const protectedStart = Math.max(0, messages.length - DETAILED_RECENT_MESSAGES);

  return messages.map((message, index) => {
    if (index >= protectedStart) {
      return message;
    }

    if (message.role === "tool") {
      return {
        ...message,
        content: compactToolPayload(message.name, message.content ?? "", aggressive ? 320 : 700),
      };
    }

    if (message.role === "assistant") {
      return {
        ...message,
        content: truncate(message.content ?? "", aggressive ? 300 : 700),
        reasoningContent: message.reasoningContent,
      };
    }

    if (message.role === "user") {
      return {
        ...message,
        content: truncate(message.content ?? "", aggressive ? 320 : 800),
      };
    }

    return message;
  });
}

function summarizeConversation(messages: StoredMessage[], maxChars: number): string {
  const summaryLines: string[] = [];
  const candidates = pickSummaryCandidates(messages);
  let totalChars = 0;

  for (const message of candidates) {
    const line = summarizeStoredMessage(message);
    if (!line) {
      continue;
    }

    const nextLine = `- ${line}`;
    if (summaryLines.includes(nextLine)) {
      continue;
    }

    const nextChars = totalChars + nextLine.length + 1;
    if (nextChars > maxChars) {
      break;
    }

    summaryLines.push(nextLine);
    totalChars = nextChars;
  }

  if (summaryLines.length === 0) {
    return "No current turn context summary was available.";
  }

  return summaryLines.join("\n");
}

function pickSummaryCandidates(messages: StoredMessage[]): StoredMessage[] {
  const currentFrameStart = findLatestUserInputIndex(messages);
  const frameMessages = currentFrameStart >= 0 ? messages.slice(currentFrameStart) : messages;
  const recent = frameMessages
    .filter((message) => !(message.role === "user" && isInternalMessage(message.content)))
    .slice(-MAX_SUMMARY_MESSAGE_COUNT);

  return recent;
}

function summarizeStoredMessage(message: StoredMessage): string {
  if (message.role === "user") {
    return `User asked: ${truncate(oneLine(message.content ?? ""), 240)}`;
  }

  if (message.role === "assistant" && message.tool_calls?.length) {
    const names = message.tool_calls.map((toolCall) => toolCall.function.name).join(", ");
    const content = truncate(oneLine(message.content ?? ""), 140);
    return content
      ? `Assistant planned tools (${names}) and said: ${content}`
      : `Assistant planned tools: ${names}`;
  }

  if (message.role === "assistant") {
    return `Assistant said: ${truncate(oneLine(message.content ?? ""), 220)}`;
  }

  if (message.role === "tool") {
    return `Tool ${message.name ?? "unknown"} returned: ${compactToolPayload(
      message.name,
      message.content ?? "",
      220,
    )}`;
  }

  return "";
}

function estimateChatMessagesChars(messages: ProviderMessage[]): number {
  return messages.reduce((total, message) => total + JSON.stringify(message).length, 0);
}

function appendSummary(systemPrompt: string | PromptLayers, summary: string | undefined): string | PromptLayers {
  if (!summary) {
    return systemPrompt;
  }

  if (typeof systemPrompt === "string") {
    return `${systemPrompt}\n\nCurrent turn compressed context:\n${summary}`;
  }

  return {
    ...systemPrompt,
    runtimeFactBlocks: [
      ...systemPrompt.runtimeFactBlocks,
      `Current turn compressed context:\n${summary}`,
    ],
  };
}

function renderSystemPrompt(systemPrompt: string | PromptLayers): string {
  return typeof systemPrompt === "string" ? systemPrompt : renderPromptLayers(systemPrompt);
}

function measureSystemPrompt(systemPrompt: string | PromptLayers): PromptLayerMetrics | undefined {
  return typeof systemPrompt === "string"
    ? measurePromptLayers({
        staticBlocks: [systemPrompt],
        profilePersonaBlocks: [],
        runtimeFactBlocks: [],
      })
    : measurePromptLayers(systemPrompt);
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...`;
}

