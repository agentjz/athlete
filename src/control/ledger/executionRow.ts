import type { AssignmentContract } from "../../protocol/assignment.js";
import type { ExecutionPolicySnapshot } from "../../protocol/executionPolicy.js";
import { normalizeExecutionPolicySnapshot } from "../../protocol/executionPolicy.js";
import type { CapabilityPackage } from "../../protocol/package.js";
import type {
  ExecutionLaunchMode,
  ExecutionLane,
  ExecutionProfile,
  ExecutionRecord,
  ExecutionStatus,
  ExecutionWorktreePolicy,
} from "../../execution/types.js";
import type { LeadWaitPolicyInput } from "../../protocol/leadWait.js";
import { normalizeLeadWaitPolicy } from "../../protocol/leadWait.js";
import { normalizeExecution } from "./executionRecord.js";

export interface ExecutionRow {
  id: string;
  lane: string;
  profile: string;
  launch_mode: string;
  requested_by: string;
  actor_name: string;
  actor_role: string | null;
  task_id: number | null;
  objective_key: string | null;
  objective_text: string | null;
  cwd: string;
  status: string;
  worktree_policy: string;
  worktree_name: string | null;
  session_id: string | null;
  pid: number | null;
  prompt: string | null;
  command: string | null;
  timeout_ms: number | null;
  stall_timeout_ms: number | null;
  wait_policy_json: string | null;
  assignment_id: string | null;
  assignment_json: string | null;
  capability_id: string | null;
  capability_kind: string | null;
  capability_package_json: string | null;
  execution_policy_json: string | null;
  summary: string | null;
  result_text: string | null;
  output: string | null;
  exit_code: number | null;
  pause_reason: string | null;
  status_detail: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export function mapExecutionRow(row: ExecutionRow): ExecutionRecord {
  return normalizeExecution({
    id: row.id,
    lane: row.lane as ExecutionLane,
    profile: row.profile as ExecutionProfile,
    launch: row.launch_mode as ExecutionLaunchMode,
    requestedBy: row.requested_by,
    actorName: row.actor_name,
    actorRole: row.actor_role ?? undefined,
    taskId: row.task_id ?? undefined,
    objectiveKey: row.objective_key ?? undefined,
    objectiveText: row.objective_text ?? undefined,
    cwd: row.cwd,
    status: row.status as ExecutionStatus,
    worktreePolicy: row.worktree_policy as ExecutionWorktreePolicy,
    worktreeName: row.worktree_name ?? undefined,
    sessionId: row.session_id ?? undefined,
    pid: row.pid ?? undefined,
    prompt: row.prompt ?? undefined,
    command: row.command ?? undefined,
    timeoutMs: row.timeout_ms ?? undefined,
    stallTimeoutMs: row.stall_timeout_ms ?? undefined,
    waitPolicy: readWaitPolicy(row.wait_policy_json),
    assignmentId: row.assignment_id ?? undefined,
    assignmentSnapshot: readJson<AssignmentContract>(row.assignment_json),
    capabilityId: row.capability_id ?? undefined,
    capabilityKind: row.capability_kind ?? undefined,
    capabilityPackageSnapshot: readJson<CapabilityPackage>(row.capability_package_json),
    executionPolicy: readExecutionPolicy(row.execution_policy_json),
    summary: row.summary ?? undefined,
    resultText: row.result_text ?? undefined,
    output: row.output ?? undefined,
    exitCode: row.exit_code ?? undefined,
    pauseReason: row.pause_reason ?? undefined,
    statusDetail: row.status_detail ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at ?? undefined,
  });
}

function readWaitPolicy(value: string | null): LeadWaitPolicyInput | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return normalizeLeadWaitPolicy(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function readExecutionPolicy(value: string | null): ExecutionRecord["executionPolicy"] {
  const parsed = readJson<ExecutionPolicySnapshot>(value);
  if (!parsed) {
    return undefined;
  }
  try {
    return normalizeExecutionPolicySnapshot(parsed);
  } catch {
    return undefined;
  }
}

function readJson<T>(value: string | null): T | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}
