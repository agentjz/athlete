import type { AssistantResponse } from "./types.js";

const MAX_PROMOTED_REASONING_CHARS = 240;

export function normalizeAssistantResponse(response: AssistantResponse): AssistantResponse {
  const normalizedContent = normalizeText(response.content);
  if (normalizedContent) {
    return {
      ...response,
      content: normalizedContent,
    };
  }

  if (response.toolCalls.length > 0) {
    return {
      ...response,
      content: null,
    };
  }

  const recoveredContent = recoverVisibleContent(response.reasoningContent);
  if (!recoveredContent) {
    return {
      ...response,
      content: null,
    };
  }

  return {
    ...response,
    content: recoveredContent,
    streamedAssistantContent: false,
  };
}

function recoverVisibleContent(reasoningContent: string | undefined): string | null {
  const normalizedReasoning = normalizeText(reasoningContent);
  if (!normalizedReasoning) {
    return null;
  }

  if (normalizedReasoning.length <= MAX_PROMOTED_REASONING_CHARS && isSingleVisibleAnswer(normalizedReasoning)) {
    return normalizedReasoning;
  }

  const lastLine = normalizedReasoning
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

  if (!lastLine) {
    return null;
  }

  if (lastLine.length <= MAX_PROMOTED_REASONING_CHARS && isSingleVisibleAnswer(lastLine)) {
    return lastLine;
  }

  return null;
}

function isSingleVisibleAnswer(value: string): boolean {
  if (!value) {
    return false;
  }

  const lower = value.toLowerCase();
  if (
    lower.startsWith("i need to ") ||
    lower.startsWith("i should ") ||
    lower.startsWith("let me ") ||
    lower.startsWith("first, ") ||
    lower.startsWith("now ") ||
    lower.includes("tool") ||
    lower.includes("reasoning")
  ) {
    return false;
  }

  return true;
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\r\n/g, "\n").trim();
  return normalized.length > 0 ? normalized : null;
}
