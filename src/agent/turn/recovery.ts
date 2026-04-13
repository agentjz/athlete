import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { expandStartToToolBoundary, findLatestUserIndex } from "../session/messages.js";
import { compactToolPayloadForTransport } from "../toolResults/preview.js";
import { isAbortError, sleepWithSignal } from "../../utils/abort.js";

const API_MAX_RETRIES = 3;
const API_RETRY_BASE_DELAY_MS = 1200;

export async function withApiRetries<T>(operation: () => Promise<T>, abortSignal?: AbortSignal): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= API_MAX_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      lastError = error;
      if (!isRetryableApiError(error) || attempt === API_MAX_RETRIES) {
        break;
      }

      await sleepWithSignal(API_RETRY_BASE_DELAY_MS * attempt, abortSignal);
    }
  }

  throw lastError;
}

export function isRetryableApiError(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  if (typeof status === "number") {
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }

  const message = String((error as { message?: unknown }).message ?? error).toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("connection error") ||
    message.includes("connection reset") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("connect timeout") ||
    message.includes("temporarily") ||
    message.includes("rate limit") ||
    message.includes("overloaded")
  );
}

export function isContentPolicyError(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  const message = String((error as { message?: unknown }).message ?? error).toLowerCase();

  return (
    status === 400 &&
    (message.includes("content exists risk") ||
      message.includes("content policy") ||
      message.includes("unsafe content") ||
      message.includes("risk"))
  );
}

export function isContextLengthError(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  const message = String((error as { message?: unknown }).message ?? error).toLowerCase();

  return (
    status === 400 &&
    (message.includes("context length") ||
      message.includes("maximum context length") ||
      message.includes("context window") ||
      message.includes("too many tokens") ||
      message.includes("prompt is too long") ||
      message.includes("max tokens"))
  );
}

export function isToolCompatibilityError(error: unknown): boolean {
  const message = String((error as { message?: unknown }).message ?? error).toLowerCase();

  return (
    message.includes("function calling") ||
    message.includes("tool call") ||
    message.includes("tools are not supported") ||
    message.includes("tool is not supported") ||
    message.includes("does not support tools")
  );
}

export function sanitizeMessagesForContentPolicy(
  messages: ChatCompletionMessageParam[],
): ChatCompletionMessageParam[] {
  return messages.map((message, index) => {
    if (index === 0 && message.role === "system") {
      const content = typeof message.content === "string" ? message.content : "";
      return {
        ...message,
        content:
          `${content}\n\nProvider safety fallback: if some tool outputs are redacted, continue using filenames, metadata, paths, and summaries instead of raw content.` +
          "\nDo not echo sensitive raw text. Prefer high-level summaries, structural observations, and safe paraphrases.",
      };
    }

    if (message.role !== "tool" || typeof message.content !== "string") {
      return message;
    }

    return {
      ...message,
      content: redactToolPayload(message.content),
    };
  });
}

export function shrinkMessagesForContextLimit(
  messages: ChatCompletionMessageParam[],
): ChatCompletionMessageParam[] {
  const systemMessage = messages[0];
  const rest = messages.slice(1);
  const latestUserIndex = findLatestUserIndex(rest);
  const tailStart = expandStartToToolBoundary(rest, Math.max(0, rest.length - 14));
  const trimmedTail = rest.slice(tailStart).map((message, index, array) => {
    const globalIndex = tailStart + index;
    const detailed = index >= Math.max(0, array.length - 6);

    if (message.role === "tool" && typeof message.content === "string") {
      return {
        ...message,
        content: compactToolPayloadForTransport(message.content, detailed ? 800 : 260),
      };
    }

    if (message.role === "assistant") {
      const cloned: Record<string, unknown> = {
        ...message,
      };

      if (typeof cloned.content === "string") {
        cloned.content = compactText(cloned.content, detailed ? 1_200 : 400);
      }

      if (globalIndex <= latestUserIndex) {
        delete cloned.reasoning_content;
      }

      return cloned as unknown as ChatCompletionMessageParam;
    }

    if ((message.role === "user" || message.role === "system") && typeof message.content === "string") {
      return {
        ...message,
        content: compactText(message.content, detailed ? 2_000 : 600),
      };
    }

    return message;
  });

  if (!systemMessage || systemMessage.role !== "system") {
    return trimmedTail;
  }

  return [
    {
      ...systemMessage,
      content:
        typeof systemMessage.content === "string"
          ? compactText(systemMessage.content, 12_000)
          : systemMessage.content,
    },
    ...trimmedTail,
  ];
}

function redactToolPayload(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const redacted = { ...parsed };

    if ("content" in redacted) {
      redacted.content = "[redacted due to provider safety policy]";
    }
    if ("preview" in redacted) {
      redacted.preview = "[redacted due to provider safety policy]";
    }
    if ("output" in redacted) {
      redacted.output = "[redacted due to provider safety policy]";
    }
    if (Array.isArray(redacted.matches)) {
      redacted.matches = redacted.matches.map((item) => {
        if (!item || typeof item !== "object") {
          return item;
        }

        const match = { ...(item as Record<string, unknown>) };
        if ("text" in match) {
          match.text = "[redacted]";
        }
        return match;
      });
    }

    redacted.redaction = "tool content removed after provider content-policy rejection";
    return JSON.stringify(redacted, null, 2);
  } catch {
    return JSON.stringify(
      {
        redaction: "tool content removed after provider content-policy rejection",
      },
      null,
      2,
    );
  }
}

function compactText(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`;
}

