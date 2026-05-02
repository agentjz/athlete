export const RUNTIME_UI_EVENT_PROTOCOL = "kitty.runtime-ui-event" as const;

export type RuntimeUiChannel =
  | "lead"
  | "dream"
  | "workflow"
  | "subagent"
  | "team"
  | "background"
  | "system";

export type RuntimeUiEventKind =
  | "assistant_text"
  | "reasoning"
  | "status"
  | "dispatch"
  | "tool_call"
  | "tool_result"
  | "tool_error"
  | "foreground_start"
  | "foreground_message"
  | "foreground_end";

export interface RuntimeUiEvent {
  protocol: typeof RUNTIME_UI_EVENT_PROTOCOL;
  channel: RuntimeUiChannel;
  kind: RuntimeUiEventKind;
  message?: string;
  actor?: string;
  executionId?: string;
  toolName?: string;
  payload?: string;
  ok?: boolean;
  level?: "info" | "warn" | "error";
  createdAt: string;
}

export function createRuntimeUiEvent(
  input: Omit<RuntimeUiEvent, "protocol" | "createdAt"> & { createdAt?: string },
): RuntimeUiEvent {
  return {
    protocol: RUNTIME_UI_EVENT_PROTOCOL,
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...input,
  };
}

export function normalizeRuntimeUiChannel(value: string | undefined): RuntimeUiChannel {
  const normalized = String(value ?? "").trim().toLowerCase();
  switch (normalized) {
    case "dream":
    case "dreaming":
      return "dream";
    case "workflow":
      return "workflow";
    case "subagent":
    case "sub-agent":
      return "subagent";
    case "team":
    case "teammate":
      return "team";
    case "background":
      return "background";
    case "lead":
      return "lead";
    default:
      return "system";
  }
}
