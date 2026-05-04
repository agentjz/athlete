import { createRuntimeUiEvent, normalizeRuntimeUiChannel, type RuntimeUiEvent } from "./events.js";

export function parseForegroundStreamRuntimeUiEvent(
  label: string,
  executionId: string,
  line: string,
): RuntimeUiEvent {
  const channel = normalizeRuntimeUiChannel(label);
  try {
    const parsed = JSON.parse(line) as {
      label?: string;
      message?: string;
      level?: "info" | "warn" | "error";
      data?: {
        eventKind?: string;
        toolName?: string;
        payload?: string;
        ok?: boolean;
      };
      createdAt?: string;
    };
    const parsedChannel = normalizeRuntimeUiChannel(parsed.label || label);
    const eventKind = parsed.data?.eventKind;
    if (isRuntimeUiEventKind(eventKind)) {
      return createRuntimeUiEvent({
        channel: parsedChannel,
        kind: eventKind,
        executionId,
        message: parsed.message,
        toolName: parsed.data?.toolName,
        payload: parsed.data?.payload ?? parsed.message,
        ok: parsed.data?.ok,
        level: parsed.level,
        createdAt: parsed.createdAt,
      });
    }
    return createRuntimeUiEvent({
      channel: parsedChannel,
      kind: "foreground_message",
      executionId,
      message: parsed.message ?? "",
      level: parsed.level,
      createdAt: parsed.createdAt,
    });
  } catch {
    return createRuntimeUiEvent({
      channel,
      kind: "foreground_message",
      executionId,
      message: line,
    });
  }
}

function isRuntimeUiEventKind(value: unknown): value is RuntimeUiEvent["kind"] {
  return value === "assistant_text" ||
    value === "reasoning" ||
    value === "status" ||
    value === "dispatch" ||
    value === "tool_call" ||
    value === "tool_result" ||
    value === "tool_error" ||
    value === "foreground_start" ||
    value === "foreground_message" ||
    value === "foreground_end";
}
