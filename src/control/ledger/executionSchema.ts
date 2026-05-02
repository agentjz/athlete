import type Database from "better-sqlite3";

export function createExecutionSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS executions (
      id TEXT PRIMARY KEY,
      lane TEXT NOT NULL CHECK (lane IN ('agent', 'command')),
      profile TEXT NOT NULL CHECK (profile IN ('subagent', 'teammate', 'background', 'workflow', 'dreaming')),
      launch_mode TEXT NOT NULL CHECK (launch_mode IN ('worker')),
      requested_by TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      actor_role TEXT,
      task_id INTEGER,
      objective_key TEXT,
      objective_text TEXT,
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
      wait_policy_json TEXT,
      assignment_id TEXT,
      assignment_json TEXT,
      capability_id TEXT,
      capability_kind TEXT,
      capability_package_json TEXT,
      execution_policy_json TEXT,
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

export function dropExecutionIndexes(db: Database.Database): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_executions_status;
    DROP INDEX IF EXISTS idx_executions_task;
    DROP INDEX IF EXISTS idx_executions_actor;
  `);
}

export function readExecutionColumns(db: Database.Database): Set<string> {
  return new Set(
    db.prepare(`PRAGMA table_info(executions)`).all().map((row) => String((row as { name?: unknown }).name ?? "")),
  );
}

export function addMissingExecutionColumns(db: Database.Database, additions: readonly (readonly [string, string])[]): void {
  const columns = readExecutionColumns(db);
  for (const [name, type] of additions) {
    if (!columns.has(name)) {
      db.exec(`ALTER TABLE executions ADD COLUMN ${name} ${type}`);
    }
  }
}
