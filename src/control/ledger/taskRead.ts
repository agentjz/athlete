import type Database from "better-sqlite3";

import type { TodoItem } from "../../types.js";
import type { TaskRecord } from "../../tasks/types.js";
import { parseJsonText } from "./shared.js";
import { type TaskDependencyRow } from "./taskGraph.js";
import { normalizeTaskRecord } from "./taskRecord.js";

interface TaskRow {
  id: number;
  subject: string;
  description: string;
  status: string;
  checklist_json: string;
  assignee: string;
  owner: string;
  worktree_name: string | null;
  created_at: string;
  updated_at: string;
}

export function loadTaskRecord(db: Database.Database, taskId: number): TaskRecord {
  const task = findTaskRecord(db, taskId);
  if (!task) {
    throw new Error(`Task ${taskId} not found.`);
  }

  return task;
}

export function findTaskRecord(db: Database.Database, taskId: number): TaskRecord | undefined {
  return listTaskRecords(db).find((task) => task.id === Math.trunc(taskId));
}

export function listTaskRecords(db: Database.Database): TaskRecord[] {
  const taskRows = db.prepare(`
    SELECT
      id,
      subject,
      description,
      status,
      checklist_json,
      assignee,
      owner,
      worktree_name,
      created_at,
      updated_at
    FROM tasks
    ORDER BY id
  `).all() as TaskRow[];
  const dependencyRows = db.prepare(`
    SELECT blocker_task_id, blocked_task_id
    FROM task_dependencies
    ORDER BY blocker_task_id, blocked_task_id
  `).all() as TaskDependencyRow[];

  const blockedBy = new Map<number, number[]>();
  const blocks = new Map<number, number[]>();
  for (const row of dependencyRows) {
    blockedBy.set(row.blocked_task_id, [...(blockedBy.get(row.blocked_task_id) ?? []), row.blocker_task_id]);
    blocks.set(row.blocker_task_id, [...(blocks.get(row.blocker_task_id) ?? []), row.blocked_task_id]);
  }

  return taskRows.map((row) => normalizeTaskRecord({
    id: row.id,
    subject: row.subject,
    description: row.description,
    status: row.status as TaskRecord["status"],
    blockedBy: blockedBy.get(row.id) ?? [],
    blocks: blocks.get(row.id) ?? [],
    checklist: parseJsonText<TodoItem[]>(row.checklist_json, []),
    assignee: row.assignee,
    owner: row.owner,
    worktree: row.worktree_name ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
