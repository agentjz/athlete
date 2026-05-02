export const EXECUTION_COLUMNS = [
  "id",
  "lane",
  "profile",
  "launch_mode",
  "requested_by",
  "actor_name",
  "actor_role",
  "task_id",
  "objective_key",
  "objective_text",
  "cwd",
  "status",
  "worktree_policy",
  "worktree_name",
  "session_id",
  "pid",
  "prompt",
  "command",
  "timeout_ms",
  "stall_timeout_ms",
  "wait_policy_json",
  "assignment_id",
  "assignment_json",
  "capability_id",
  "capability_kind",
  "capability_package_json",
  "execution_policy_json",
  "summary",
  "result_text",
  "output",
  "exit_code",
  "pause_reason",
  "status_detail",
  "created_at",
  "updated_at",
  "finished_at",
] as const;

export const EXECUTION_COLUMN_LIST = EXECUTION_COLUMNS.join(",\n        ");

export const EXECUTION_VALUE_PLACEHOLDERS = EXECUTION_COLUMNS.map(() => "?").join(", ");

export const EXECUTION_UPDATE_ASSIGNMENTS = EXECUTION_COLUMNS
  .filter((column) => column !== "id")
  .map((column) => `${column} = excluded.${column}`)
  .join(",\n        ");
