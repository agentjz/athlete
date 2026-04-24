import path from "node:path";

import type Database from "better-sqlite3";

import type { WorktreeRecord, WorktreeStatus } from "../../worktrees/types.js";
import { currentTimestamp } from "./shared.js";

export class WorktreeLedgerRepo {
  constructor(private readonly db: Database.Database) {}

  list(): WorktreeRecord[] {
    const rows = this.db.prepare(`
      SELECT
        w.name,
        w.path,
        w.branch,
        w.status,
        w.created_at,
        w.updated_at,
        t.id AS task_id
      FROM worktrees w
      LEFT JOIN tasks t ON t.worktree_name = w.name
      ORDER BY w.name
    `).all() as WorktreeRow[];
    return rows.map((row) => mapWorktreeRow(row));
  }

  find(name: string): WorktreeRecord | undefined {
    const normalizedName = normalizeWorktreeName(name);
    if (!normalizedName) {
      return undefined;
    }

    return this.list().find((worktree) => worktree.name === normalizedName);
  }

  get(name: string): WorktreeRecord {
    const worktree = this.find(name);
    if (!worktree) {
      throw new Error(`Unknown worktree: ${name}`);
    }
    return worktree;
  }

  upsert(record: WorktreeRecord): WorktreeRecord {
    const normalized = normalizeWorktreeRecord(record);
    this.db.prepare(`
      INSERT INTO worktrees (name, path, branch, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        path = excluded.path,
        branch = excluded.branch,
        status = excluded.status,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `).run(
      normalized.name,
      normalized.path,
      normalized.branch,
      normalized.status,
      normalized.createdAt,
      normalized.updatedAt,
    );
    return this.get(normalized.name);
  }
}

interface WorktreeRow {
  name: string;
  path: string;
  branch: string;
  status: string;
  created_at: string;
  updated_at: string;
  task_id: number | null;
}

export function normalizeWorktreeRecord(record: WorktreeRecord): WorktreeRecord {
  const now = currentTimestamp();
  return {
    name: normalizeWorktreeName(record.name),
    path: path.resolve(String(record.path ?? "")),
    branch: String(record.branch ?? "").trim() || `wt/${normalizeWorktreeName(record.name) || "task"}`,
    status: normalizeWorktreeStatus(record.status),
    taskId: typeof record.taskId === "number" && Number.isFinite(record.taskId) ? Math.trunc(record.taskId) : undefined,
    createdAt: typeof record.createdAt === "string" && record.createdAt ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === "string" && record.updatedAt ? record.updatedAt : now,
  };
}

export function normalizeWorktreeName(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function normalizeWorktreeStatus(value: string): WorktreeStatus {
  return value === "kept" || value === "removed" ? value : "active";
}

function mapWorktreeRow(row: WorktreeRow): WorktreeRecord {
  return normalizeWorktreeRecord({
    name: row.name,
    path: row.path,
    branch: row.branch,
    status: row.status as WorktreeStatus,
    taskId: row.task_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}
