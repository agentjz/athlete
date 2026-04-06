import path from "node:path";

import type { SessionRecord, StoredMessage, TaskState } from "../types.js";

const MAX_ACTIVE_FILES = 12;
const MAX_PLANNED_ACTIONS = 8;
const MAX_COMPLETED_ACTIONS = 12;
const MAX_BLOCKERS = 8;
const INTERNAL_PREFIX = "[internal]";

export function createEmptyTaskState(timestamp = new Date().toISOString()): TaskState {
  return {
    activeFiles: [],
    plannedActions: [],
    completedActions: [],
    blockers: [],
    lastUpdatedAt: timestamp,
  };
}

export function deriveTaskState(messages: StoredMessage[], previous?: TaskState): TaskState {
  const now = new Date().toISOString();
  const objective = findObjective(messages) ?? previous?.objective;
  const objectiveChanged =
    typeof previous?.objective === "string" &&
    typeof objective === "string" &&
    oneLine(previous.objective).toLowerCase() !== oneLine(objective).toLowerCase();

  if (objectiveChanged) {
    return {
      objective,
      activeFiles: [],
      plannedActions: [],
      completedActions: [],
      blockers: [],
      lastUpdatedAt: now,
    };
  }

  return {
    objective,
    activeFiles: takeLastUnique(collectActiveFiles(messages), MAX_ACTIVE_FILES),
    plannedActions: takeLastUnique(collectPlannedActions(messages), MAX_PLANNED_ACTIONS),
    completedActions: takeLastUnique(collectCompletedActions(messages), MAX_COMPLETED_ACTIONS),
    blockers: takeLastUnique(collectBlockers(messages), MAX_BLOCKERS),
    lastUpdatedAt: now,
  };
}

export function normalizeTaskState(taskState: TaskState | undefined): TaskState | undefined {
  if (!taskState) {
    return undefined;
  }

  return {
    objective: typeof taskState.objective === "string" ? taskState.objective : undefined,
    activeFiles: takeLastUnique(taskState.activeFiles ?? [], MAX_ACTIVE_FILES),
    plannedActions: takeLastUnique(taskState.plannedActions ?? [], MAX_PLANNED_ACTIONS),
    completedActions: takeLastUnique(taskState.completedActions ?? [], MAX_COMPLETED_ACTIONS),
    blockers: takeLastUnique(taskState.blockers ?? [], MAX_BLOCKERS),
    lastUpdatedAt:
      typeof taskState.lastUpdatedAt === "string" && taskState.lastUpdatedAt.length > 0
        ? taskState.lastUpdatedAt
        : new Date().toISOString(),
  };
}

export function formatTaskStateBlock(taskState: TaskState | undefined): string {
  if (!taskState) {
    return "- none";
  }

  const parts = [
    taskState.objective ? `- Objective: ${taskState.objective}` : "- Objective: none",
    `- Active files: ${formatList(taskState.activeFiles)}`,
    `- Planned actions: ${formatList(taskState.plannedActions)}`,
    `- Completed actions: ${formatList(taskState.completedActions)}`,
    `- Blockers: ${formatList(taskState.blockers)}`,
    `- Updated at: ${taskState.lastUpdatedAt}`,
  ];

  return parts.join("\n");
}

export function isInternalMessage(content: string | null | undefined): boolean {
  return typeof content === "string" && content.trim().toLowerCase().startsWith(INTERNAL_PREFIX);
}

export function isContinuationDirective(content: string | null | undefined): boolean {
  if (typeof content !== "string") {
    return false;
  }

  const normalized = oneLine(content).toLowerCase();
  if (!normalized || isInternalMessage(normalized)) {
    return false;
  }

  return (
    /^(continue|resume|go on|keep going|carry on|proceed|continue please|resume please)$/.test(normalized) ||
    /^(continue|resume)\b.*\b(current|same|existing|task|checkpoint|where you left off)\b/.test(normalized) ||
    /^(继续|继续吧|接着|接着做|继续做|继续处理|继续执行|恢复)$/.test(normalized)
  );
}

export function createInternalReminder(text: string): string {
  return `${INTERNAL_PREFIX} ${text}`.trim();
}

export function normalizeSessionRecord(session: SessionRecord): SessionRecord {
  return {
    ...session,
    messageCount: Array.isArray(session.messages) ? session.messages.length : 0,
    messages: Array.isArray(session.messages) ? session.messages : [],
    taskState: normalizeTaskState(
      session.taskState ?? deriveTaskState(Array.isArray(session.messages) ? session.messages : []),
    ),
  };
}

function findObjective(messages: StoredMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user" || isInternalMessage(message.content) || isContinuationDirective(message.content)) {
      continue;
    }

    const normalized = oneLine(message.content ?? "");
    if (normalized) {
      return truncate(normalized, 240);
    }
  }

  return undefined;
}

function collectActiveFiles(messages: StoredMessage[]): string[] {
  const files: string[] = [];

  for (const message of messages) {
    if (!message) {
      continue;
    }

    if (message.role === "assistant" && message.tool_calls?.length) {
      for (const toolCall of message.tool_calls) {
        const parsed = safeParseObject(toolCall.function.arguments);
        collectPathsFromValue(parsed, files);
      }
      continue;
    }

    if (message.role === "tool") {
      const parsed = safeParseObject(message.content ?? "");
      collectPathsFromValue(parsed, files);
    }
  }

  return files
    .map((value) => normalizeFilePath(value))
    .filter(Boolean) as string[];
}

function collectPlannedActions(messages: StoredMessage[]): string[] {
  const actions: string[] = [];

  for (const message of messages) {
    if (message?.role !== "assistant" || !message.tool_calls?.length) {
      continue;
    }

    const names = message.tool_calls.map((toolCall) => toolCall.function.name).join(", ");
    if (names) {
      actions.push(`plan ${names}`);
    }
  }

  return actions;
}

function collectCompletedActions(messages: StoredMessage[]): string[] {
  const actions: string[] = [];

  for (const message of messages) {
    if (message?.role !== "tool" || !message.name) {
      continue;
    }

    const parsed = safeParseObject(message.content ?? "");
    if (parsed && typeof parsed.error === "string" && parsed.error.length > 0) {
      continue;
    }

    actions.push(formatCompletedAction(message.name, parsed));
  }

  return actions.filter(Boolean);
}

function collectBlockers(messages: StoredMessage[]): string[] {
  const blockers: string[] = [];

  for (const message of messages) {
    if (message?.role !== "tool") {
      continue;
    }

    const parsed = safeParseObject(message.content ?? "");
    if (!parsed || typeof parsed.error !== "string" || parsed.error.length === 0) {
      continue;
    }

    blockers.push(`${message.name ?? "tool"}: ${truncate(oneLine(parsed.error), 180)}`);
  }

  return blockers;
}

function formatCompletedAction(toolName: string, payload: Record<string, unknown> | null): string {
  const pathValue = normalizeFilePath(readPath(payload?.path));

  if (toolName === "run_shell") {
    const command = typeof payload?.command === "string" ? payload.command : "command";
    const exitCode = typeof payload?.exitCode === "number" ? payload.exitCode : "unknown";
    return `run_shell ${truncate(oneLine(command), 120)} (exit ${exitCode})`;
  }

  if (toolName === "search_files") {
    const count = Array.isArray(payload?.matches) ? payload.matches.length : 0;
    return `search_files ${count} match(es)`;
  }

  if (toolName === "list_files") {
    const count = Array.isArray(payload?.entries) ? payload.entries.length : 0;
    return `list_files ${count} entr${count === 1 ? "y" : "ies"}`;
  }

  if (toolName === "apply_patch") {
    const count = Array.isArray(payload?.applied) ? payload.applied.length : 0;
    return `apply_patch ${count} file(s)`;
  }

  if (toolName === "load_skill") {
    return "load_skill";
  }

  if (pathValue) {
    return `${toolName} ${truncate(pathValue, 160)}`;
  }

  return toolName;
}

function collectPathsFromValue(value: unknown, bucket: string[]): void {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPathsFromValue(item, bucket);
    }
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && isPathLikeKey(key)) {
      bucket.push(item);
      continue;
    }

    if (Array.isArray(item)) {
      for (const nested of item) {
        collectPathsFromValue(nested, bucket);
      }
      continue;
    }

    if (item && typeof item === "object") {
      collectPathsFromValue(item, bucket);
    }
  }
}

function isPathLikeKey(key: string): boolean {
  return key === "path" || key === "cwd" || key.endsWith("Path");
}

function readPath(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function safeParseObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeFilePath(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("<") || trimmed.includes("\n")) {
    return undefined;
  }

  if (trimmed.length > 260) {
    return truncate(trimmed, 260);
  }

  return trimmed.includes(path.sep) || trimmed.includes("/") || trimmed.includes(".")
    ? trimmed
    : undefined;
}

function takeLastUnique(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index]?.trim();
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.unshift(value);
    if (result.length >= limit) {
      break;
    }
  }

  return result;
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

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(" | ") : "none";
}
