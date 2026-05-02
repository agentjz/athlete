import type Database from "better-sqlite3";

import { createExecutionSchema, dropExecutionIndexes } from "./executionSchema.js";

export function rebuildExecutionSchemaWithoutInline(db: Database.Database): void {
  rebuildExecutionSchema(db, `
    SELECT
      id,
      lane,
      profile,
      launch_mode,
      requested_by,
      actor_name,
      actor_role,
      task_id,
      NULL,
      NULL,
      cwd,
      status,
      worktree_policy,
      worktree_name,
      session_id,
      pid,
      prompt,
      command,
      timeout_ms,
      stall_timeout_ms,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      summary,
      result_text,
      output,
      exit_code,
      pause_reason,
      status_detail,
      created_at,
      updated_at,
      finished_at
    FROM executions_old
    WHERE launch_mode = 'worker'
  `);
}

export function rebuildExecutionSchemaWithWorkflowProfile(db: Database.Database): void {
  rebuildExecutionSchema(db, `
    SELECT
      id,
      lane,
      profile,
      launch_mode,
      requested_by,
      actor_name,
      actor_role,
      task_id,
      objective_key,
      objective_text,
      cwd,
      status,
      worktree_policy,
      worktree_name,
      session_id,
      pid,
      prompt,
      command,
      timeout_ms,
      stall_timeout_ms,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      summary,
      result_text,
      output,
      exit_code,
      pause_reason,
      status_detail,
      created_at,
      updated_at,
      finished_at
    FROM executions_old
    WHERE launch_mode = 'worker'
  `);
}

export function rebuildExecutionSchemaWithDreamingProfile(db: Database.Database): void {
  rebuildExecutionSchema(db, `
    SELECT
      id,
      lane,
      profile,
      launch_mode,
      requested_by,
      actor_name,
      actor_role,
      task_id,
      objective_key,
      objective_text,
      cwd,
      status,
      worktree_policy,
      worktree_name,
      session_id,
      pid,
      prompt,
      command,
      timeout_ms,
      stall_timeout_ms,
      wait_policy_json,
      assignment_id,
      assignment_json,
      capability_id,
      capability_kind,
      capability_package_json,
      execution_policy_json,
      summary,
      result_text,
      output,
      exit_code,
      pause_reason,
      status_detail,
      created_at,
      updated_at,
      finished_at
    FROM executions_old
    WHERE launch_mode = 'worker'
  `);
}

function rebuildExecutionSchema(db: Database.Database, selectSql: string): void {
  dropExecutionIndexes(db);
  db.exec("ALTER TABLE executions RENAME TO executions_old;");
  createExecutionSchema(db);
  db.exec(`
    INSERT INTO executions (
      id,
      lane,
      profile,
      launch_mode,
      requested_by,
      actor_name,
      actor_role,
      task_id,
      objective_key,
      objective_text,
      cwd,
      status,
      worktree_policy,
      worktree_name,
      session_id,
      pid,
      prompt,
      command,
      timeout_ms,
      stall_timeout_ms,
      wait_policy_json,
      assignment_id,
      assignment_json,
      capability_id,
      capability_kind,
      capability_package_json,
      execution_policy_json,
      summary,
      result_text,
      output,
      exit_code,
      pause_reason,
      status_detail,
      created_at,
      updated_at,
      finished_at
    )
    ${selectSql};

    DROP TABLE executions_old;
  `);
}
