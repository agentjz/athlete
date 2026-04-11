import { normalizeTodoItems } from "../../agent/session.js";
import type { TodoItem } from "../../types.js";
import type { TaskRecord, TaskStatus } from "../../tasks/types.js";
import { currentTimestamp, normalizeText } from "./shared.js";

export function normalizeTaskRecord(task: TaskRecord): TaskRecord {
  const now = currentTimestamp();
  return {
    id: Math.max(1, Math.trunc(task.id)),
    subject: normalizeText(task.subject),
    description: normalizeText(task.description),
    status: normalizeTaskStatus(task.status),
    blockedBy: uniqueNumbers(task.blockedBy ?? []),
    blocks: uniqueNumbers(task.blocks ?? []),
    checklist: normalizeTodoItems(task.checklist ?? []),
    assignee: normalizeText(task.assignee),
    owner: normalizeText(task.owner),
    worktree: normalizeText(task.worktree),
    createdAt: typeof task.createdAt === "string" && task.createdAt ? task.createdAt : now,
    updatedAt: typeof task.updatedAt === "string" && task.updatedAt ? task.updatedAt : now,
  };
}

export function completeChecklist(value: TodoItem[] | undefined): TodoItem[] {
  return normalizeTodoItems(value ?? []).map((item) => ({
    ...item,
    status: "completed",
  }));
}

export function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isFinite(value)).map((value) => Math.trunc(value)))]
    .filter((value) => value > 0)
    .sort((left, right) => left - right);
}

function normalizeTaskStatus(value: string): TaskStatus {
  return value === "pending" || value === "in_progress" || value === "completed"
    ? value
    : "pending";
}
