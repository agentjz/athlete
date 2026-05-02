import crypto from "node:crypto";

import type { ExecutionPolicySnapshot } from "../../protocol/executionPolicy.js";
import { normalizeExecutionPolicySnapshot } from "../../protocol/executionPolicy.js";
import type {
  ExecutionLaunchMode,
  ExecutionLane,
  ExecutionProfile,
  ExecutionRecord,
  ExecutionStatus,
  ExecutionWorktreePolicy,
} from "../../execution/types.js";
import { resolveExecutionBoundary } from "../../execution/boundary.js";
import type { LeadWaitPolicyInput } from "../../protocol/leadWait.js";
import { createLeadWaitPolicy, normalizeLeadWaitPolicy } from "../../protocol/leadWait.js";
import { currentTimestamp, normalizeText } from "./shared.js";

export function normalizeExecution(
  record: Omit<ExecutionRecord, "boundary" | "waitPolicy"> & {
    waitPolicy?: LeadWaitPolicyInput;
    boundary?: ExecutionRecord["boundary"];
  },
): ExecutionRecord {
  const now = currentTimestamp();
  const profile = normalizeProfile(record.profile);
  const timeoutMs = normalizeOptionalNumber(record.timeoutMs);
  const stallTimeoutMs = normalizeOptionalNumber(record.stallTimeoutMs);
  const boundary = resolveExecutionBoundary({ profile, timeoutMs, stallTimeoutMs });
  const executionPolicy = normalizeOptionalExecutionPolicy(record.executionPolicy);
  const assignmentSnapshot = record.assignmentSnapshot;
  const capabilityPackageSnapshot = record.capabilityPackageSnapshot;
  const waitPolicy = record.waitPolicy
    ? normalizeLeadWaitPolicy(record.waitPolicy)
    : executionPolicy
      ? normalizeLeadWaitPolicy(executionPolicy.leadWaitPolicy)
      : createLeadWaitPolicy({
          lead: record.requestedBy === "lead" ? "while_execution_active" : "none",
          wake: "required",
          scope: record.taskId ? "task" : record.objectiveKey ? "objective" : "global",
        });

  return {
    id: normalizeExecutionId(record.id) || createExecutionId(),
    lane: normalizeLane(record.lane),
    profile,
    launch: normalizeLaunch(record.launch),
    requestedBy: normalizeText(record.requestedBy) || "lead",
    actorName: normalizeText(record.actorName) || "execution",
    actorRole: normalizeOptionalText(record.actorRole),
    taskId: typeof record.taskId === "number" && Number.isFinite(record.taskId) ? Math.trunc(record.taskId) : undefined,
    objectiveKey: normalizeOptionalText(record.objectiveKey),
    objectiveText: normalizeOptionalText(record.objectiveText),
    cwd: normalizeText(record.cwd),
    status: normalizeStatus(record.status),
    worktreePolicy: normalizeWorktreePolicy(record.worktreePolicy),
    worktreeName: normalizeOptionalText(record.worktreeName),
    sessionId: normalizeOptionalText(record.sessionId),
    pid: typeof record.pid === "number" && Number.isFinite(record.pid) ? Math.trunc(record.pid) : undefined,
    prompt: normalizeOptionalText(record.prompt),
    command: normalizeOptionalText(record.command),
    timeoutMs: boundary.maxRuntimeMs,
    stallTimeoutMs: boundary.maxIdleMs,
    waitPolicy,
    assignmentId: normalizeOptionalText(record.assignmentId) ?? assignmentSnapshot?.assignmentId,
    assignmentSnapshot,
    capabilityId: normalizeOptionalText(record.capabilityId)
      ?? capabilityPackageSnapshot?.packageId
      ?? assignmentSnapshot?.capabilityId,
    capabilityKind: normalizeOptionalText(record.capabilityKind) ?? capabilityPackageSnapshot?.profile.kind,
    capabilityPackageSnapshot,
    executionPolicy,
    boundary,
    summary: normalizeOptionalText(record.summary),
    resultText: normalizeOptionalText(record.resultText),
    output: normalizeOptionalText(record.output),
    exitCode: typeof record.exitCode === "number" && Number.isFinite(record.exitCode)
      ? Math.trunc(record.exitCode)
      : undefined,
    pauseReason: normalizeOptionalText(record.pauseReason),
    statusDetail: normalizeOptionalText(record.statusDetail),
    createdAt: typeof record.createdAt === "string" && record.createdAt ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === "string" && record.updatedAt ? record.updatedAt : now,
    finishedAt: normalizeOptionalText(record.finishedAt),
  };
}

export function normalizeExecutionId(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

export function createExecutionId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

function normalizeLane(value: string): ExecutionLane {
  if (value === "agent" || value === "command") {
    return value;
  }
  throw new Error(`Invalid execution lane '${String(value)}'.`);
}

function normalizeProfile(value: string): ExecutionProfile {
  switch (value) {
    case "subagent":
    case "background":
    case "teammate":
    case "workflow":
    case "dreaming":
      return value;
    default:
      throw new Error(`Invalid execution profile '${String(value)}'.`);
  }
}

function normalizeLaunch(value: string): ExecutionLaunchMode {
  if (value === "worker") {
    return value;
  }
  throw new Error(`Invalid execution launch mode '${String(value)}'.`);
}

function normalizeWorktreePolicy(value: string | undefined): ExecutionWorktreePolicy {
  if (value === undefined || value === "none" || value === "task") {
    return value ?? "none";
  }
  throw new Error(`Invalid execution worktree policy '${String(value)}'.`);
}

function normalizeStatus(value: string): ExecutionStatus {
  switch (value) {
    case "queued":
    case "running":
    case "paused":
    case "completed":
    case "failed":
    case "aborted":
      return value;
    default:
      throw new Error(`Invalid execution status '${String(value)}'.`);
  }
}

function normalizeOptionalExecutionPolicy(value: ExecutionPolicySnapshot | undefined): ExecutionPolicySnapshot | undefined {
  return value ? normalizeExecutionPolicySnapshot(value) : undefined;
}

function normalizeOptionalText(value: unknown): string | undefined {
  const normalized = normalizeText(value);
  return normalized ? normalized : undefined;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined;
}
