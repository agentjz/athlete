import type { AgentCallbacks, AgentDispatchEvent } from "../agent/types.js";
import { appendForegroundStreamEventSync } from "./foregroundStream.js";

export function createExecutionForegroundCallbacks(input: {
  rootDir: string;
  executionId: string;
  label: string;
}): AgentCallbacks {
  const append = (
    message: string,
    data: Record<string, unknown>,
    level: "info" | "warn" | "error" = "info",
  ): void => {
    if (!message) {
      return;
    }
    appendForegroundStreamEventSync({
      rootDir: input.rootDir,
      executionId: input.executionId,
      label: input.label,
      level,
      message,
      data,
    });
  };

  return {
    onModelWaitStart: () => append("waiting for model", { eventKind: "status" }),
    onModelWaitStop: () => append("streaming", { eventKind: "status" }),
    onStatus: (text) => append(text, { eventKind: "status" }),
    onAssistantStage: (text) => append(text, { eventKind: "assistant_text" }),
    onAssistantDelta: (delta) => append(delta, { eventKind: "assistant_text" }),
    onAssistantText: (text) => append(text, { eventKind: "assistant_text" }),
    onReasoningDelta: (delta) => append(delta, { eventKind: "reasoning" }),
    onReasoning: (text) => append(text, { eventKind: "reasoning" }),
    onDispatch: (event) => append(formatDispatchMessage(event), {
      eventKind: "dispatch",
      actorName: event.actorName,
      profile: event.profile,
      executionId: event.executionId,
    }),
    onToolCall: (name, args) => append(`tool ${name}`, {
      eventKind: "tool_call",
      toolName: name,
      payload: args,
    }),
    onToolResult: (name, output) => append(`result ${name}`, {
      eventKind: "tool_result",
      toolName: name,
      payload: output,
      ok: true,
    }),
    onToolError: (name, error) => append(`tool ${name} failed`, {
      eventKind: "tool_error",
      toolName: name,
      payload: error,
      ok: false,
    }, "error"),
  };
}

function formatDispatchMessage(event: AgentDispatchEvent): string {
  return [
    event.actorName,
    "started",
    typeof event.taskId === "number" ? `task=${event.taskId}` : undefined,
    typeof event.pid === "number" ? `pid=${event.pid}` : undefined,
    event.summary,
  ].filter(Boolean).join(" ");
}
