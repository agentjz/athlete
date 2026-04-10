import type { ManagedTurnOptions } from "../agent/turn.js";
import type { TelegramLogger } from "./logger.js";
import { TelegramTurnDisplay } from "./turnDisplay.js";

export function createLoggedTelegramCallbacks(
  display: TelegramTurnDisplay,
  logger: TelegramLogger,
  context: {
    peerKey: string;
    userId: number;
    chatId: number;
    sessionId: string;
  },
): ManagedTurnOptions["callbacks"] {
  return {
    ...display.callbacks,
    onStatus: (text) => {
      logger.info("phase", {
        ...context,
        detail: text,
      });
      display.callbacks.onStatus?.(text);
    },
    onToolCall: (name, args) => {
      logger.info("tool call", {
        ...context,
        toolName: name,
        detail: summarizeText(args, 120),
      });
      display.callbacks.onToolCall?.(name, args);
    },
    onToolResult: (name, output) => {
      logger.info("tool finished", {
        ...context,
        toolName: name,
        detail: `chars=${output.length}`,
      });
      display.callbacks.onToolResult?.(name, output);
    },
    onToolError: (name, error) => {
      logger.error("tool failed", {
        ...context,
        toolName: name,
        detail: `chars=${error.length}`,
      });
      display.callbacks.onToolError?.(name, error);
    },
  };
}

export function summarizeText(value: string, maxChars = 100): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "empty";
  }

  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, maxChars - 3)}...`;
}
