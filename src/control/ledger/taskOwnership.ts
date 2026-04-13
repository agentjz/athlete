import type Database from "better-sqlite3";

import type { TaskRecord } from "../../tasks/types.js";
import { currentTimestamp, normalizeText } from "./shared.js";
import { listTaskRecords, loadTaskRecord } from "./taskRead.js";

export function claimTask(db: Database.Database, taskId: number, owner: string): TaskRecord {
  const normalizedOwner = normalizeText(owner);
  if (!normalizedOwner) {
    throw new Error("Task owner is required.");
  }

  const now = currentTimestamp();
  const result = db.prepare(`
    UPDATE tasks
    SET
      owner = ?,
      status = 'in_progress',
      updated_at = ?
    WHERE id = ?
      AND status <> 'completed'
      AND (assignee = '' OR assignee = ?)
      AND (owner = '' OR owner = ?)
      AND NOT EXISTS (
        SELECT 1
        FROM task_dependencies
        INNER JOIN tasks AS blockers ON blockers.id = task_dependencies.blocker_task_id
        WHERE blocked_task_id = tasks.id
          AND blockers.status <> 'completed'
      )
  `).run(normalizedOwner, now, Math.trunc(taskId), normalizedOwner, normalizedOwner);

  if (result.changes === 1) {
    return loadTaskRecord(db, taskId);
  }

  const task = loadTaskRecord(db, taskId);
  if (task.status === "completed") {
    throw new Error(`Task ${taskId} is already completed.`);
  }
  if (task.blockedBy.length > 0) {
    throw new Error(`Task ${taskId} is blocked by ${task.blockedBy.join(", ")}.`);
  }
  if (task.assignee && task.assignee !== normalizedOwner) {
    throw new Error(`Task ${taskId} is assigned to ${task.assignee}.`);
  }
  if (task.owner && task.owner !== normalizedOwner) {
    throw new Error(`Task ${taskId} is already claimed by ${task.owner}.`);
  }

  return task;
}

export function findOwnedActiveTask(db: Database.Database, owner: string): TaskRecord | undefined {
  const normalizedOwner = normalizeText(owner);
  if (!normalizedOwner) {
    return undefined;
  }

  return listTaskRecords(db)
    .filter((task) => task.owner === normalizedOwner && task.status !== "completed")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

export function assignTask(db: Database.Database, taskId: number, assignee: string): TaskRecord {
  const normalizedAssignee = normalizeText(assignee);
  if (!normalizedAssignee) {
    throw new Error("Task assignee is required.");
  }

  const task = loadTaskRecord(db, taskId);
  if (task.status === "completed") {
    throw new Error(`Task ${taskId} is already completed.`);
  }
  if (task.owner && task.owner !== normalizedAssignee) {
    throw new Error(`Task ${taskId} is already claimed by ${task.owner}.`);
  }

  db.prepare(`
    UPDATE tasks
    SET assignee = ?, updated_at = ?
    WHERE id = ?
  `).run(normalizedAssignee, currentTimestamp(), Math.trunc(taskId));
  return loadTaskRecord(db, taskId);
}

export function releaseTaskOwner(db: Database.Database, owner: string): TaskRecord[] {
  const normalizedOwner = normalizeText(owner);
  if (!normalizedOwner) {
    return [];
  }

  const affectedIds = listTaskRecords(db)
    .filter((task) => task.owner === normalizedOwner && task.status !== "completed")
    .map((task) => task.id);
  if (affectedIds.length === 0) {
    return [];
  }

  db.prepare(`
    UPDATE tasks
    SET owner = '', status = 'pending', updated_at = ?
    WHERE owner = ? AND status <> 'completed'
  `).run(currentTimestamp(), normalizedOwner);

  return affectedIds.map((id) => loadTaskRecord(db, id));
}

export function bindTaskWorktree(db: Database.Database, taskId: number, worktree: string): TaskRecord {
  db.prepare(`
    UPDATE tasks
    SET
      worktree_name = ?,
      status = CASE WHEN status = 'pending' THEN 'in_progress' ELSE status END,
      updated_at = ?
    WHERE id = ?
  `).run(nullableWorktreeName(worktree), currentTimestamp(), Math.trunc(taskId));
  return loadTaskRecord(db, taskId);
}

export function unbindTaskWorktree(db: Database.Database, taskId: number): TaskRecord {
  db.prepare(`
    UPDATE tasks
    SET worktree_name = NULL, updated_at = ?
    WHERE id = ?
  `).run(currentTimestamp(), Math.trunc(taskId));
  return loadTaskRecord(db, taskId);
}

export function listClaimableTasks(db: Database.Database, owner?: string): TaskRecord[] {
  const normalizedOwner = normalizeText(owner);
  const tasks = listTaskRecords(db).filter((task) =>
    task.status !== "completed" &&
    task.blockedBy.length === 0 &&
    !task.owner &&
    (!normalizedOwner || !task.assignee || task.assignee === normalizedOwner));

  if (!normalizedOwner) {
    return tasks;
  }

  return tasks.sort((left, right) => {
    const leftPriority = left.assignee === normalizedOwner ? 0 : 1;
    const rightPriority = right.assignee === normalizedOwner ? 0 : 1;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return left.id - right.id;
  });
}

function nullableWorktreeName(value: string): string | null {
  const normalized = normalizeText(value);
  return normalized ? normalized : null;
}
