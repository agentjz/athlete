import type { StoredMessage } from "../../types.js";

const INTERNAL_PREFIX = "[internal]";

export function isInternalMessage(content: string | null | undefined): boolean {
  return typeof content === "string" && content.trim().toLowerCase().startsWith(INTERNAL_PREFIX);
}

export function createInternalReminder(text: string): string {
  return `${INTERNAL_PREFIX} ${text}`.trim();
}

export function readUserInput(content: string | null | undefined): string | undefined {
  if (isInternalMessage(content)) {
    return undefined;
  }

  const normalized = oneLine(content ?? "");
  return normalized || undefined;
}

export function findLatestUserInputIndex(messages: StoredMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user" && readUserInput(message.content)) {
      return index;
    }
  }

  return -1;
}

export function sliceCurrentUserInputFrame(messages: StoredMessage[]): StoredMessage[] {
  const frameStart = findLatestUserInputIndex(messages);
  if (frameStart < 0) {
    return [];
  }

  const frame = messages.slice(frameStart);
  return frame.filter((message) => !(message.role === "user" && isInternalMessage(message.content)));
}

export function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
