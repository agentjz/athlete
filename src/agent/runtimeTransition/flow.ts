import { isContinuationDirective, isInternalMessage } from "../session/taskState.js";
import type { RuntimeContinueTransition, RuntimeTransition, SessionCheckpointFlow, SessionCheckpointPhase, SessionCheckpointStatus } from "../../types.js";
import { normalizeRuntimeTransition } from "./normalize.js";
import { clampWholeNumber, normalizeText, normalizeTimestamp } from "./shared.js";

interface BuildCheckpointFlowInput {
  current: SessionCheckpointFlow | undefined;
  status: SessionCheckpointStatus;
  transition?: RuntimeTransition;
  fallbackPhase?: SessionCheckpointPhase;
  timestamp?: string;
}

export function normalizeCheckpointFlow(
  flow: SessionCheckpointFlow | undefined,
  status: SessionCheckpointStatus,
  timestamp = new Date().toISOString(),
): SessionCheckpointFlow {
  const lastTransition = normalizeRuntimeTransition(flow?.lastTransition, timestamp);
  const phase = normalizePhase(lastTransition ? getRuntimeTransitionPhase(lastTransition) : flow?.phase, status);

  return {
    phase,
    reason: lastTransition ? formatRuntimeTransitionReason(lastTransition) : normalizeText(flow?.reason) || undefined,
    recoveryFailures:
      lastTransition?.action === "recover"
        ? lastTransition.reason.consecutiveFailures
        : phase === "recovery"
          ? clampWholeNumber(flow?.recoveryFailures, 1, 50, undefined)
          : undefined,
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

  return {
    phase,
    reason: transition ? formatRuntimeTransitionReason(transition) : undefined,
    recoveryFailures: transition?.action === "recover" ? transition.reason.consecutiveFailures : undefined,
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
