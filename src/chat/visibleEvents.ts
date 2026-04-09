import type { AgentCallbacks } from "../agent/types.js";

export interface VisibleTurnEvent {
  kind: "assistant" | "tool_call" | "todo_preview" | "tool_result_preview";
  text: string;
}

const TOOL_RESULT_PREVIEW_MAX_CHARS = 150;

export function createVisibleTurnCallbacks(options: {
  onActivity: () => void;
  onVisibleEvent: (event: VisibleTurnEvent) => void;
  shouldEmitEvent?: (event: VisibleTurnEvent) => boolean;
  flushBufferedAssistantBeforeToolEvents?: boolean;
  dropBufferedAssistantBeforeToolEvents?: boolean;
  enableAssistantStageEvents?: boolean;
}): AgentCallbacks {
  const assistantState = {
    bufferedDeltaText: "",
    finalizedByTextEvent: false,
  };

  const resetAssistantStage = (): void => {
    assistantState.bufferedDeltaText = "";
    assistantState.finalizedByTextEvent = false;
  };

  const flushBufferedAssistantStage = (): void => {
    if (assistantState.bufferedDeltaText.length === 0) {
      return;
    }

    emitAssistantStage(options, assistantState.bufferedDeltaText);
    resetAssistantStage();
  };

  const handleBufferedAssistantBeforeToolEvent = (): void => {
    if (options.flushBufferedAssistantBeforeToolEvents) {
      flushBufferedAssistantStage();
      return;
    }

    if (options.dropBufferedAssistantBeforeToolEvents) {
      resetAssistantStage();
    }
  };

  return {
    onModelWaitStart: () => {
      options.onActivity();
    },
    onStatus: () => {
      options.onActivity();
    },
    onAssistantDelta: (delta) => {
      options.onActivity();
      if (assistantState.finalizedByTextEvent) {
        resetAssistantStage();
      }

      assistantState.bufferedDeltaText += delta;
    },
    onAssistantText: (text) => {
      options.onActivity();
      emitAssistantStage(options, text);
      assistantState.bufferedDeltaText = "";
      assistantState.finalizedByTextEvent = true;
    },
    onAssistantStage: (text) => {
      options.onActivity();
      if (!options.enableAssistantStageEvents) {
        return;
      }

      emitAssistantStage(options, text);
      resetAssistantStage();
    },
    onAssistantDone: (text) => {
      options.onActivity();
      if (assistantState.bufferedDeltaText.length > 0) {
        emitAssistantStage(
          options,
          typeof text === "string" && text.length > 0 ? text : assistantState.bufferedDeltaText,
        );
        resetAssistantStage();
        return;
      }

      if (!assistantState.finalizedByTextEvent) {
        emitAssistantStage(options, text);
      }

      resetAssistantStage();
    },
    onReasoningDelta: () => {
      options.onActivity();
    },
    onReasoning: () => {
      options.onActivity();
    },
    onToolCall: (name) => {
      options.onActivity();
      handleBufferedAssistantBeforeToolEvent();
      emitNormalizedVisibleText(options, "tool_call", name);
    },
    onToolResult: (name, output) => {
      options.onActivity();
      handleBufferedAssistantBeforeToolEvent();
      if (name !== "todo_write") {
        emitNormalizedVisibleText(options, "tool_result_preview", extractToolResultPreview(output));
        return;
      }

      const preview = extractTodoPreview(output);
      emitExactVisibleText(options, "todo_preview", preview);
    },
    onToolError: () => {
      options.onActivity();
      handleBufferedAssistantBeforeToolEvent();
    },
    onModelWaitStop: () => {
      return;
    },
  };
}

export function extractTodoPreview(rawOutput: string): string | null {
  try {
    const parsed = JSON.parse(rawOutput) as { preview?: unknown };
    if (typeof parsed.preview === "string" && parsed.preview.length > 0) {
      return parsed.preview;
    }
  } catch {
    return null;
  }

  return null;
}

export function extractToolResultPreview(rawOutput: string): string | null {
  const parsed = tryParseVisibleObject(rawOutput);
  const preview =
    extractPrimaryPreview(parsed) ??
    extractEntriesPreview(parsed) ??
    extractMatchesPreview(parsed) ??
    rawOutput;
  return truncateVisibleText(preview, TOOL_RESULT_PREVIEW_MAX_CHARS);
}

function emitAssistantText(
  options: {
    onVisibleEvent: (event: VisibleTurnEvent) => void;
  },
  rawText: string | null | undefined,
): void {
  emitExactVisibleText(options, "assistant", rawText);
}

function emitAssistantStage(
  options: {
    onVisibleEvent: (event: VisibleTurnEvent) => void;
  },
  rawText: string | null | undefined,
): void {
  emitAssistantText(options, rawText);
}

function emitNormalizedVisibleText(
  options: {
    onVisibleEvent: (event: VisibleTurnEvent) => void;
    shouldEmitEvent?: (event: VisibleTurnEvent) => boolean;
  },
  kind: VisibleTurnEvent["kind"],
  rawText: string | null | undefined,
): void {
  const text = normalizeVisibleText(rawText);
  if (!text) {
    return;
  }

  const event: VisibleTurnEvent = {
    kind,
    text,
  };
  if (options.shouldEmitEvent && !options.shouldEmitEvent(event)) {
    return;
  }
  options.onVisibleEvent(event);
}

function emitExactVisibleText(
  options: {
    onVisibleEvent: (event: VisibleTurnEvent) => void;
    shouldEmitEvent?: (event: VisibleTurnEvent) => boolean;
  },
  kind: VisibleTurnEvent["kind"],
  rawText: string | null | undefined,
): void {
  if (typeof rawText !== "string" || rawText.length === 0) {
    return;
  }

  const event: VisibleTurnEvent = {
    kind,
    text: rawText,
  };
  if (options.shouldEmitEvent && !options.shouldEmitEvent(event)) {
    return;
  }
  options.onVisibleEvent(event);
}

function normalizeVisibleText(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim() ? value : "";
}

function truncateVisibleText(value: string | null | undefined, maxChars: number): string | null {
  const normalized = normalizeVisibleText(
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : value,
  );
  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars)}...`;
}

function tryParseVisibleObject(rawOutput: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawOutput);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractPrimaryPreview(payload: Record<string, unknown> | null): string | null {
  if (!payload) {
    return null;
  }

  for (const key of ["preview", "content", "output", "markdownPreview", "error", "reason", "hint"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function extractEntriesPreview(payload: Record<string, unknown> | null): string | null {
  const entries = payload?.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  const fragments = entries
    .slice(0, 2)
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const type = record.type === "directory" ? "dir" : "file";
      const path = typeof record.path === "string" ? record.path : "";
      return path ? `${type} ${path}` : null;
    })
    .filter((value): value is string => Boolean(value));

  return fragments.length > 0 ? fragments.join(" ") : null;
}

function extractMatchesPreview(payload: Record<string, unknown> | null): string | null {
  const matches = payload?.matches;
  if (!Array.isArray(matches) || matches.length === 0) {
    return null;
  }

  const first = matches[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) {
    return null;
  }

  const record = first as Record<string, unknown>;
  const path = typeof record.path === "string" ? record.path : "";
  const text = typeof record.text === "string" ? record.text : "";
  const line = typeof record.line === "number" ? record.line : undefined;
  const prefix = path ? `${path}${line ? `:${line}` : ""}` : "";

  if (prefix && text) {
    return `${prefix} ${text}`;
  }

  return prefix || text || null;
}
