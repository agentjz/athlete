import { isContinuationDirective, isInternalMessage } from "../session/taskState.js";
import type {
  CompactionRecoveryState,
  PendingToolCall,
  SessionRunState,
  SessionRunStateSource,
  RuntimeContinueTransition,
  RuntimeTransition,
  SessionCheckpointFlow,
  SessionCheckpointPhase,
  SessionCheckpointStatus,
} from "../../types.js";
import { normalizeRuntimeTransition } from "./normalize.js";
import { clampWholeNumber, normalizeText, normalizeTimestamp } from "./shared.js";

interface BuildCheckpointFlowInput {
  current: SessionCheckpointFlow | undefined;
  status: SessionCheckpointStatus;
  transition?: RuntimeTransition;
  fallbackPhase?: SessionCheckpointPhase;
  runState?: {
    status: SessionRunState["status"];
    source?: SessionRunStateSource;
  };
  pendingToolCalls?: PendingToolCall[];
  compactionRecovery?: CompactionRecoveryState;
  timestamp?: string;
}

export function normalizeCheckpointFlow(
  flow: SessionCheckpointFlow | undefined,
  status: SessionCheckpointStatus,
  timestamp = new Date().toISOString(),
): SessionCheckpointFlow {
  const lastTransition = normalizeRuntimeTransition(flow?.lastTransition, timestamp);
  const phase = normalizePhase(lastTransition ? getRuntimeTransitionPhase(lastTransition) : flow?.phase, status);
  const pendingToolCalls = status === "completed" ? undefined : normalizePendingToolCalls(flow?.pendingToolCalls, timestamp);
  const runState = normalizeRunState({
    current: flow?.runState,
    status,
    pendingToolCalls,
    timestamp,
  });

  return {
    phase,
    reason: lastTransition ? formatRuntimeTransitionReason(lastTransition) : normalizeText(flow?.reason) || undefined,
    recoveryFailures:
      lastTransition?.action === "recover"
        ? lastTransition.reason.consecutiveFailures
        : phase === "recovery"
          ? clampWholeNumber(flow?.recoveryFailures, 1, 50, undefined)
          : undefined,
    runState,
    pendingToolCalls,
    compactionRecovery: status === "completed" ? undefined : normalizeCompactionRecovery(flow?.compactionRecovery, timestamp),
    lastTransition,
    updatedAt: normalizeTimestamp(flow?.updatedAt, timestamp),
  };
}

export function buildCheckpointFlow(input: BuildCheckpointFlowInput): SessionCheckpointFlow {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const transition = normalizeRuntimeTransition(input.transition, timestamp);
  const phase = normalizePhase(
    transition ? getRuntimeTransitionPhase(transition) : input.fallbackPhase ?? input.current?.phase,
    input.status,
  );
  const pendingToolCalls = input.status === "completed"
    ? undefined
    : normalizePendingToolCalls(input.pendingToolCalls ?? input.current?.pendingToolCalls, timestamp);
  const runState = normalizeRunState({
    current: input.current?.runState,
    status: input.status,
    pendingToolCalls,
    override: input.runState,
    timestamp,
  });

  return {
    phase,
    reason: transition ? formatRuntimeTransitionReason(transition) : undefined,
    recoveryFailures: transition?.action === "recover" ? transition.reason.consecutiveFailures : undefined,
    runState,
    pendingToolCalls,
    compactionRecovery: input.status === "completed"
      ? undefined
      : normalizeCompactionRecovery(input.compactionRecovery ?? input.current?.compactionRecovery, timestamp),
    lastTransition: transition,
    updatedAt: timestamp,
  };
}

export function getTurnInputTransition(
  input: string,
  timestamp = new Date().toISOString(),
): RuntimeContinueTransition | undefined {
  if (isInternalMessage(input)) {
    return {
      action: "continue",
      reason: {
        code: "continue.resume_from_checkpoint",
        source: "managed_continuation",
      },
      timestamp,
    };
  }

  if (isContinuationDirective(input)) {
    return {
      action: "continue",
      reason: {
        code: "continue.resume_from_checkpoint",
        source: "resume_directive",
      },
      timestamp,
    };
  }

  return undefined;
}

export function formatRuntimeTransitionReason(transition: RuntimeTransition): string {
  return transition.reason.code;
}

export function getRuntimeTransitionPhase(transition: RuntimeTransition): SessionCheckpointPhase {
  if (transition.action === "recover") {
    return "recovery";
  }

  if (transition.action === "pause" && transition.reason.code === "pause.degradation_recovery_exhausted") {
    return "recovery";
  }

  if (transition.action === "pause" && transition.reason.code === "pause.provider_recovery_budget_exhausted") {
    return "recovery";
  }

  if (transition.action === "pause" && transition.reason.code === "pause.managed_slice_budget_exhausted") {
    return "continuation";
  }

  if (transition.action === "yield") {
    return "continuation";
  }

  if (transition.action === "continue" && transition.reason.code === "continue.resume_from_checkpoint") {
    return transition.reason.source === "managed_continuation" ? "continuation" : "resume";
  }

  return "active";
}

function normalizePhase(
  value: SessionCheckpointPhase | undefined,
  status: SessionCheckpointStatus,
): SessionCheckpointPhase {
  if (status === "completed") {
    return "active";
  }

  return value === "continuation" || value === "resume" || value === "recovery" ? value : "active";
}

function normalizePendingToolCalls(
  pendingToolCalls: PendingToolCall[] | undefined,
  timestamp: string,
): PendingToolCall[] | undefined {
  if (!Array.isArray(pendingToolCalls) || pendingToolCalls.length === 0) {
    return undefined;
  }

  const seen = new Set<string>();
  const result: PendingToolCall[] = [];
  for (const pending of pendingToolCalls) {
    if (!pending || typeof pending !== "object") {
      continue;
    }

    const id = normalizeText(pending.id);
    const name = normalizeText(pending.name);
    if (!id || !name || seen.has(id)) {
      continue;
    }

    seen.add(id);
    result.push({
      id,
      name,
      policy: pending.policy === "parallel" ? "parallel" : "sequential",
      preparedAt: normalizeTimestamp(pending.preparedAt, timestamp),
    });
  }

  return result.length > 0 ? result : undefined;
}

function normalizeCompactionRecovery(
  recovery: CompactionRecoveryState | undefined,
  timestamp: string,
): CompactionRecoveryState | undefined {
  if (!recovery || typeof recovery !== "object" || recovery.active !== true) {
    return undefined;
  }

  return {
    active: true,
    compressedSince: normalizeTimestamp(recovery.compressedSince, timestamp),
    noTextStreak: clampWholeNumber(recovery.noTextStreak, 0, 99, 0) ?? 0,
    recoveryAttempts: clampWholeNumber(recovery.recoveryAttempts, 0, 99, 0) ?? 0,
    lastRecoveryAt: normalizeTimestamp(recovery.lastRecoveryAt, "") || undefined,
    pausedAt: normalizeTimestamp(recovery.pausedAt, "") || undefined,
  };
}

function normalizeRunState(input: {
  current: SessionRunState | undefined;
  status: SessionCheckpointStatus;
  pendingToolCalls: PendingToolCall[] | undefined;
  override?: {
    status: SessionRunState["status"];
    source?: SessionRunStateSource;
  };
  timestamp: string;
}): SessionRunState {
  const pendingToolCallCount = input.pendingToolCalls?.length ?? 0;
  const normalizedStatus = input.status === "completed"
    ? "idle"
    : input.override?.status === "busy" || input.override?.status === "idle"
      ? input.override.status
      : pendingToolCallCount > 0
        ? "busy"
        : input.current?.status === "busy"
          ? "busy"
          : "idle";

  const source = normalizeRunStateSource(
    input.status === "completed"
      ? "checkpoint"
      : input.override?.source ?? (pendingToolCallCount > 0 ? "tool_batch" : input.current?.source),
    normalizedStatus,
  );

  return {
    status: normalizedStatus,
    source,
    pendingToolCallCount,
    updatedAt: input.timestamp,
  };
}

function normalizeRunStateSource(
  source: SessionRunStateSource | undefined,
  status: SessionRunState["status"],
): SessionRunStateSource {
  if (status === "idle") {
    return source === "turn" ? "checkpoint" : source ?? "checkpoint";
  }

  if (source === "turn" || source === "tool_batch") {
    return source;
  }

  return "checkpoint";
}
