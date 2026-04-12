import type Database from "better-sqlite3";

import { currentTimestamp } from "./shared.js";

const LEDGER_SCHEMA_VERSION = 2;

export function applyLedgerMigrations(db: Database.Database): void {
  const userVersion = readUserVersion(db);
  if (userVersion >= LEDGER_SCHEMA_VERSION) {
    return;
  }

  if (userVersion === 0) {
    createBaseSchema(db);
  }

  if (userVersion < 2) {
    createExecutionSchema(db);
  }

  db.pragma(`user_version = ${LEDGER_SCHEMA_VERSION}`);
  ensureLedgerMetaRow(db, "schema_version", String(LEDGER_SCHEMA_VERSION));
}

function createExecutionSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS executions (
      id TEXT PRIMARY KEY,
      lane TEXT NOT NULL CHECK (lane IN ('agent', 'command')),
      profile TEXT NOT NULL CHECK (profile IN ('subagent', 'teammate', 'background')),
      launch_mode TEXT NOT NULL CHECK (launch_mode IN ('inline', 'worker')),
      requested_by TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      actor_role TEXT,
      task_id INTEGER,
      cwd TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'paused', 'completed', 'failed', 'aborted')),
      worktree_policy TEXT NOT NULL CHECK (worktree_policy IN ('none', 'task')),
      worktree_name TEXT,
      session_id TEXT,
      pid INTEGER,
      prompt TEXT,
      command TEXT,
      timeout_ms INTEGER,
      stall_timeout_ms INTEGER,
      summary TEXT,
      result_text TEXT,
      output TEXT,
      exit_code INTEGER,
      pause_reason TEXT,
      status_detail TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      finished_at TEXT,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
      FOREIGN KEY (worktree_name) REFERENCES worktrees(name) DEFERRABLE INITIALLY DEFERRED
    );

    CREATE INDEX IF NOT EXISTS idx_executions_status
      ON executions(status, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_executions_task
      ON executions(task_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_executions_actor
      ON executions(actor_name, created_at DESC);
  `);
}

function readUserVersion(db: Database.Database): number {
  const value = db.pragma("user_version", { simple: true });
  return typeof value === "number" ? value : 0;
}

function createBaseSchema(db: Database.Database): void {
  const now = currentTimestamp();
  db.exec(`
    CREATE TABLE IF NOT EXISTS ledger_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS worktrees (
      name TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      branch TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'kept', 'removed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed')),
      checklist_json TEXT NOT NULL DEFAULT '[]',
      assignee TEXT NOT NULL DEFAULT '',
      owner TEXT NOT NULL DEFAULT '',
      worktree_name TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (worktree_name) REFERENCES worktrees(name) DEFERRABLE INITIALLY DEFERRED
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_worktree_name_unique
      ON tasks(worktree_name)
      WHERE worktree_name IS NOT NULL AND worktree_name <> '';

    CREATE TABLE IF NOT EXISTS task_dependencies (
      blocker_task_id INTEGER NOT NULL,
      blocked_task_id INTEGER NOT NULL,
      PRIMARY KEY (blocker_task_id, blocked_task_id),
      FOREIGN KEY (blocker_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (blocked_task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_task_dependencies_blocked
      ON task_dependencies(blocked_task_id);

    CREATE TABLE IF NOT EXISTS team_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      team_name TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS team_members (
      name TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('working', 'idle', 'shutdown')),
      session_id TEXT,
      pid INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coordination_policy (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      allow_plan_decisions INTEGER NOT NULL,
      allow_shutdown_requests INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS protocol_requests (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('shutdown', 'plan_approval')),
      from_name TEXT NOT NULL,
      to_name TEXT NOT NULL,
      subject TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
      decision_approve INTEGER,
      decision_feedback TEXT,
      decision_responded_by TEXT,
      decision_responded_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.prepare(`
    INSERT INTO team_config (id, team_name, updated_at)
    VALUES (1, 'default', ?)
    ON CONFLICT(id) DO NOTHING
  `).run(now);
  db.prepare(`
    INSERT INTO coordination_policy (id, allow_plan_decisions, allow_shutdown_requests, updated_at)
    VALUES (1, 0, 0, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(now);
  ensureLedgerMetaRow(db, "initialized_at", now);
}

function ensureLedgerMetaRow(db: Database.Database, key: string, value: string): void {
  db.prepare(`
    INSERT INTO ledger_meta (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(key, value, currentTimestamp());
}
