import type Database from "better-sqlite3";

import { normalizeTodoItems } from "../../agent/session.js";
import type { TodoItem } from "../../types.js";
import type { TaskRecord, TaskStatus } from "../../tasks/types.js";
import { currentTimestamp, normalizeText, stringifyJson } from "./shared.js";
import { ensureTaskIdsExist, replaceTaskDependencies, validateTaskDependencies } from "./taskGraph.js";
import { completeChecklist, normalizeTaskRecord, uniqueNumbers } from "./taskRecord.js";
import { findTaskRecord, listTaskRecords, loadTaskRecord } from "./taskRead.js";
import {
  assignTask,
  bindTaskWorktree,
  claimTask,
  findOwnedActiveTask,
  listClaimableTasks,
  releaseTaskOwner,
  unbindTaskWorktree,
} from "./taskOwnership.js";

export class TaskLedgerRepo {
  constructor(private readonly db: Database.Database) {}

  create(subject: string, description = "", options: { assignee?: string } = {}): TaskRecord {
    const normalizedSubject = normalizeText(subject);
    if (!normalizedSubject) {
      throw new Error("Task subject is required.");
    }

    const now = currentTimestamp();
    const result = this.db.prepare(`
      INSERT INTO tasks (
        subject,
        description,
        status,
        checklist_json,
        assignee,
        owner,
        worktree_name,
        created_at,
        updated_at
      ) VALUES (?, ?, 'pending', '[]', ?, '', NULL, ?, ?)
    `).run(
      normalizedSubject,
      normalizeText(description),
      normalizeText(options.assignee),
      now,
      now,
    );

    return this.load(Number(result.lastInsertRowid));
  }

  load(taskId: number): TaskRecord {
    return loadTaskRecord(this.db, taskId);
  }

  find(taskId: number): TaskRecord | undefined {
    return findTaskRecord(this.db, taskId);
  }

  save(task: TaskRecord): TaskRecord {
    const normalized = normalizeTaskRecord(task);
    const transaction = this.db.transaction((record: TaskRecord) => {
      ensureTaskIdsExist(this.db, [record.id, ...record.blockedBy, ...record.blocks]);
      validateTaskDependencies(this.db, record.id, record.blockedBy, record.blocks);
      this.db.prepare(`
        INSERT INTO tasks (
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          subject = excluded.subject,
          description = excluded.description,
          status = excluded.status,
          checklist_json = excluded.checklist_json,
          assignee = excluded.assignee,
          owner = excluded.owner,
          worktree_name = excluded.worktree_name,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `).run(
        record.id,
        record.subject,
        record.description,
        record.status,
        stringifyJson(record.checklist ?? []),
        record.assignee,
        record.owner,
        nullableWorktreeName(record.worktree),
        record.createdAt,
        record.updatedAt,
      );
      replaceTaskDependencies(this.db, record.id, record.blockedBy, record.blocks);
      return this.load(record.id);
    });

    return transaction(normalized);
  }

  update(
    taskId: number,
    updates: {
      status?: TaskStatus;
      addBlockedBy?: number[];
      addBlocks?: number[];
      assignee?: string;
      owner?: string;
      worktree?: string;
    },
  ): TaskRecord {
    const transaction = this.db.transaction((id: number) => {
      const task = this.load(id);
      const addBlockedBy = uniqueNumbers(updates.addBlockedBy ?? []);
      const addBlocks = uniqueNumbers(updates.addBlocks ?? []);
      validateTaskDependencies(this.db, id, addBlockedBy, addBlocks, true);

      const nextStatus = updates.status ?? task.status;
      const nextBlockedBy = uniqueNumbers([...task.blockedBy, ...addBlockedBy]);
      const nextBlocks = uniqueNumbers([...task.blocks, ...addBlocks]);
      const nextChecklist =
        nextStatus === "completed"
          ? completeChecklist(task.checklist)
          : normalizeTodoItems(task.checklist ?? []);
      const nextAssignee =
        typeof updates.assignee === "string"
          ? normalizeText(updates.assignee)
          : task.assignee;
      const nextOwner =
        typeof updates.owner === "string"
          ? normalizeText(updates.owner)
          : task.owner;
      const nextWorktree =
        typeof updates.worktree === "string"
          ? normalizeText(updates.worktree)
          : task.worktree;

      if (task.status === "completed" && nextStatus !== "completed") {
        throw new Error(`Task ${id} is already completed and cannot be reopened.`);
      }

      if (nextStatus === "in_progress" && nextBlockedBy.length > 0) {
        throw new Error(`Task ${id} is blocked by ${nextBlockedBy.join(", ")} and cannot start.`);
      }

      if (nextOwner && nextBlockedBy.length > 0) {
        throw new Error(`Task ${id} is blocked by ${nextBlockedBy.join(", ")} and cannot be owned.`);
      }

      if (nextStatus === "completed" && nextBlockedBy.length > 0) {
        throw new Error(`Task ${id} is still blocked by ${nextBlockedBy.join(", ")}.`);
      }

      if (nextAssignee && nextOwner && nextOwner !== nextAssignee) {
        throw new Error(`Task ${id} is assigned to ${nextAssignee}, not ${nextOwner}.`);
      }

      this.db.prepare(`
        UPDATE tasks
        SET
          status = ?,
          checklist_json = ?,
          assignee = ?,
          owner = ?,
          worktree_name = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        nextStatus,
        stringifyJson(nextChecklist),
        nextAssignee,
        nextOwner,
        nullableWorktreeName(nextWorktree),
        currentTimestamp(),
        id,
      );

      for (const blockerId of addBlockedBy) {
        this.db.prepare(`
          INSERT OR IGNORE INTO task_dependencies (blocker_task_id, blocked_task_id)
          VALUES (?, ?)
        `).run(blockerId, id);
      }
      for (const blockedTaskId of addBlocks) {
        this.db.prepare(`
          INSERT OR IGNORE INTO task_dependencies (blocker_task_id, blocked_task_id)
          VALUES (?, ?)
        `).run(id, blockedTaskId);
      }

      if (nextStatus === "completed" && task.status !== "completed") {
        this.db.prepare(`
          DELETE FROM task_dependencies
          WHERE blocker_task_id = ?
        `).run(id);
      }

      return this.load(id);
    });

    return transaction(Math.trunc(taskId));
  }

  claim(taskId: number, owner: string): TaskRecord {
    return claimTask(this.db, taskId, owner);
  }

  setChecklist(taskId: number, checklist: TodoItem[]): TaskRecord {
    const normalizedChecklist = normalizeTodoItems(checklist);
    this.db.prepare(`
      UPDATE tasks
      SET checklist_json = ?, updated_at = ?
      WHERE id = ?
    `).run(stringifyJson(normalizedChecklist), currentTimestamp(), Math.trunc(taskId));
    return this.load(taskId);
  }

  findOwnedActive(owner: string): TaskRecord | undefined {
    return findOwnedActiveTask(this.db, owner);
  }

  assign(taskId: number, assignee: string): TaskRecord {
    return assignTask(this.db, taskId, assignee);
  }

  releaseOwner(owner: string): TaskRecord[] {
    return releaseTaskOwner(this.db, owner);
  }

  bindWorktree(taskId: number, worktree: string): TaskRecord {
    return bindTaskWorktree(this.db, taskId, worktree);
  }

  unbindWorktree(taskId: number): TaskRecord {
    return unbindTaskWorktree(this.db, taskId);
  }

  list(): TaskRecord[] {
    return listTaskRecords(this.db);
  }

  listClaimable(owner?: string): TaskRecord[] {
    return listClaimableTasks(this.db, owner);
  }
}

function nullableWorktreeName(value: string): string | null {
  const normalized = normalizeText(value);
  return normalized ? normalized : null;
}
