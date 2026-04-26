import type {
  ExecutionCloseInput,
  ExecutionRecord,
  ExecutionStartInput,
  ExecutionStatus,
} from "../../execution/types.js";
import { currentTimestamp, normalizeText } from "./shared.js";

const STARTABLE_STATUSES = new Set<ExecutionStatus>(["queued", "running", "paused"]);

export function assertExecutionSaveAllowed(current: ExecutionRecord, next: ExecutionRecord): void {
  if (current.status !== next.status) {
    throw createExecutionLifecycleError(
      current.id,
      current.status,
      next.status,
      "Execution status changes must go through start(...) or close(...).",
    );
  }
}

export function applyExecutionStart(
  current: ExecutionRecord,
  input: ExecutionStartInput,
): ExecutionRecord {
  if (!STARTABLE_STATUSES.has(current.status)) {
    throw createExecutionLifecycleError(current.id, current.status, "running");
  }

  return {
    ...current,
    status: "running",
    pid: typeof input.pid === "number" && Number.isFinite(input.pid) ? Math.trunc(input.pid) : current.pid,
    sessionId: typeof input.sessionId === "string" && input.sessionId ? input.sessionId : current.sessionId,
    cwd: normalizeText(input.cwd) || current.cwd,
    worktreeName: typeof input.worktreeName === "string" && input.worktreeName
      ? input.worktreeName
      : current.worktreeName,
    summary: undefined,
    resultText: undefined,
    output: undefined,
    exitCode: undefined,
    pauseReason: undefined,
    statusDetail: undefined,
    updatedAt: currentTimestamp(),
    finishedAt: undefined,
  };
}

export function applyExecutionClose(
  current: ExecutionRecord,
  input: ExecutionCloseInput,
): ExecutionRecord {
  if (current.status !== "running") {
    throw createExecutionLifecycleError(current.id, current.status, input.status);
  }

  const now = currentTimestamp();
  return {
    ...current,
    status: input.status,
    summary: normalizeText(input.summary),
    resultText: normalizeOptionalCloseText(input.resultText),
    output: normalizeOptionalCloseText(input.output),
    exitCode: typeof input.exitCode === "number" && Number.isFinite(input.exitCode)
      ? Math.trunc(input.exitCode)
      : undefined,
    pauseReason: input.status === "paused" ? normalizeOptionalCloseText(input.pauseReason) : undefined,
    statusDetail: input.status === "failed" || input.status === "aborted" || input.status === "paused"
      ? normalizeOptionalCloseText(input.statusDetail)
      : undefined,
    updatedAt: now,
    finishedAt: input.status === "paused" ? undefined : now,
  };
}

function createExecutionLifecycleError(
  executionId: string,
  currentStatus: ExecutionStatus,
  nextStatus: ExecutionStatus,
  detail?: string,
): Error {
  const suffix = detail ? ` ${detail}` : "";
  return new Error(
    `Execution ${executionId} cannot transition from '${currentStatus}' to '${nextStatus}'.${suffix}`,
  );
}

function normalizeOptionalCloseText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
