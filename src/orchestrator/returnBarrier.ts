import { createEmptyTaskState } from "../agent/session.js";
import type { SessionRecord } from "../types.js";
import type { DelegationDecisionAction } from "./delegation/types.js";
import type { OrchestratorDecision } from "./types.js";

export interface OrchestratorReturnBarrierState {
  pending: boolean;
  sourceAction?: DelegationDecisionAction;
  taskId?: number;
  setAt?: string;
}

export function readOrchestratorReturnBarrierState(session: SessionRecord): OrchestratorReturnBarrierState {
  const raw = session.taskState?.orchestratorReturnBarrier;
  if (!raw || typeof raw !== "object") {
    return { pending: false };
  }

  const taskId = Number((raw as { taskId?: unknown }).taskId);
  return {
    pending: Boolean((raw as { pending?: unknown }).pending),
    sourceAction: normalizeSourceAction((raw as { sourceAction?: unknown }).sourceAction),
    taskId: Number.isFinite(taskId) && taskId > 0 ? Math.trunc(taskId) : undefined,
    setAt: normalizeText((raw as { setAt?: unknown }).setAt),
  };
}

export function markOrchestratorReturnBarrierPending(
  session: SessionRecord,
  input: {
    action: DelegationDecisionAction;
    taskId?: number;
    at?: string;
  },
): SessionRecord {
  return withBarrier(session, {
    pending: true,
    sourceAction: input.action,
    taskId: typeof input.taskId === "number" && Number.isFinite(input.taskId) && input.taskId > 0
      ? Math.trunc(input.taskId)
      : undefined,
    setAt: normalizeText(input.at) || new Date().toISOString(),
  });
}

export function clearOrchestratorReturnBarrier(session: SessionRecord): SessionRecord {
  return withBarrier(session, {
    pending: false,
  });
}

export function applyOrchestratorReturnBarrier(
  session: SessionRecord,
  decision: OrchestratorDecision,
  options: { allowExplicitDelegation?: boolean } = {},
): {
  session: SessionRecord;
  decision: OrchestratorDecision;
  enforced: boolean;
} {
  const state = readOrchestratorReturnBarrierState(session);
  if (!state.pending) {
    return {
      session,
      decision,
      enforced: false,
    };
  }

  if (options.allowExplicitDelegation) {
    return {
      session,
      decision,
      enforced: false,
    };
  }

  if (decision.action === "self_execute") {
    return {
      session: clearOrchestratorReturnBarrier(session),
      decision,
      enforced: false,
    };
  }

  if (decision.action === "wait_for_existing_work") {
    return {
      session,
      decision,
      enforced: false,
    };
  }

  return {
    session,
    decision: {
      action: "self_execute",
      reason: `Return barrier requires lead review before additional delegation (previous action: ${state.sourceAction ?? "unknown"}).`,
      task: decision.task,
    },
    enforced: true,
  };
}

function withBarrier(session: SessionRecord, barrier: OrchestratorReturnBarrierState): SessionRecord {
  return {
    ...session,
    taskState: {
      ...(session.taskState ?? createEmptyTaskState()),
      orchestratorReturnBarrier: barrier,
      lastUpdatedAt: new Date().toISOString(),
    },
  };
}

function normalizeSourceAction(value: unknown): DelegationDecisionAction | undefined {
  if (value === "delegate_subagent" || value === "delegate_teammate" || value === "run_in_background") {
    return value;
  }
  return undefined;
}

function normalizeText(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : undefined;
}
