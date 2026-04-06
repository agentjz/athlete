import type { SessionRecord, StoredMessage, TodoItem, TodoStatus } from "../types.js";

const MAX_TODO_ITEMS = 20;
const MAX_TODO_TEXT_CHARS = 240;

export function deriveTodoItems(messages: StoredMessage[], previous: TodoItem[] = []): TodoItem[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "tool" || message.name !== "todo_write" || typeof message.content !== "string") {
      continue;
    }

    const parsed = safeParseJson(message.content);
    if (!parsed || typeof parsed !== "object" || !("items" in parsed)) {
      continue;
    }

    try {
      return normalizeTodoItems((parsed as { items?: unknown }).items);
    } catch {
      continue;
    }
  }

  return normalizeTodoItems(previous);
}

export function normalizeTodoItems(value: unknown): TodoItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  if (value.length > MAX_TODO_ITEMS) {
    throw new Error(`Too many todo items: max ${MAX_TODO_ITEMS}.`);
  }

  const normalized: TodoItem[] = [];
  const seenIds = new Set<string>();
  let inProgressCount = 0;

  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Each todo item must be an object.");
    }

    const record = entry as Record<string, unknown>;
    const id = String(record.id ?? "").trim();
    const text = compactTodoText(record.text);
    const status = normalizeTodoStatus(record.status);

    if (!id) {
      throw new Error("Todo item id is required.");
    }

    if (!text) {
      throw new Error(`Todo item ${id} text is required.`);
    }

    if (seenIds.has(id)) {
      throw new Error(`Duplicate todo item id: ${id}.`);
    }

    seenIds.add(id);

    if (status === "in_progress") {
      inProgressCount += 1;
      if (inProgressCount > 1) {
        throw new Error("Only one todo item can be in_progress.");
      }
    }

    normalized.push({
      id,
      text,
      status,
    });
  }

  return normalized;
}

export function formatTodoBlock(items: TodoItem[] | undefined): string {
  const todos = normalizeTodoItems(items);
  if (todos.length === 0) {
    return "- none";
  }

  const lines = todos.map((item) => `${statusMarker(item.status)} #${item.id}: ${item.text}`);
  const completed = todos.filter((item) => item.status === "completed").length;
  lines.push(`- Progress: ${completed}/${todos.length} completed`);
  return lines.join("\n");
}

export function summarizeTodoItems(items: TodoItem[] | undefined): string {
  const todos = normalizeTodoItems(items);
  if (todos.length === 0) {
    return "No todos.";
  }

  const completed = todos.filter((item) => item.status === "completed").length;
  return `${completed}/${todos.length} completed`;
}

export function hasIncompleteTodos(items: TodoItem[] | undefined): boolean {
  return normalizeTodoItems(items).some((item) => item.status !== "completed");
}

export function normalizeSessionTodos(session: SessionRecord): SessionRecord {
  return {
    ...session,
    todoItems: deriveTodoItems(session.messages ?? [], session.todoItems ?? []),
  };
}

function normalizeTodoStatus(value: unknown): TodoStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "pending" || normalized === "in_progress" || normalized === "completed") {
    return normalized;
  }

  throw new Error(`Invalid todo status: ${String(value ?? "")}.`);
}

function compactTodoText(value: unknown): string {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_TODO_TEXT_CHARS) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_TODO_TEXT_CHARS)}...`;
}

function statusMarker(status: TodoStatus): string {
  switch (status) {
    case "completed":
      return "[x]";
    case "in_progress":
      return "[>]";
    default:
      return "[ ]";
  }
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
