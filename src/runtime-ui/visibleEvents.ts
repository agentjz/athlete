import type { AgentCallbacks } from "../agent/types.js";
import { buildToolResultVisiblePreview } from "./toolDisplay.js";

export interface VisibleTurnEvent {
  kind: "assistant" | "tool_call" | "todo_preview" | "tool_result_preview";
  text: string;
}

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
      if (name === "todo_write") {
        emitExactVisibleText(options, "todo_preview", extractTodoPreview(output));
        return;
      }

      emitNormalizedVisibleText(options, "tool_result_preview", buildToolResultVisiblePreview(name, output));
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
