import path from "node:path";

import type { StoredMessage } from "../../types.js";

export function collectActiveFiles(messages: StoredMessage[]): string[] {
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

  return files.map((value) => normalizeFilePath(value)).filter(Boolean) as string[];
}

export function collectPlannedActions(messages: StoredMessage[]): string[] {
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

export function collectCompletedActions(messages: StoredMessage[]): string[] {
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

export function collectBlockers(messages: StoredMessage[]): string[] {
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

export function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`;
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

  return pathValue ? `${toolName} ${truncate(pathValue, 160)}` : toolName;
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
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
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
