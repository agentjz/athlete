import type { RecoveryRequestConfig } from "../retryPolicy.js";
import type { RunTurnResult } from "../types.js";
import type {
  RuntimeContinueTransition,
  RuntimeFinalizeTransition,
  RuntimePauseTransition,
  RuntimeRecoverTransition,
  RuntimeTerminalTransition,
  RuntimeYieldTransition,
  SessionRecord,
  VerificationState,
} from "../../types.js";
import { clampWholeNumber, normalizeExitCode, normalizeText, takeLastUnique, truncate } from "./shared.js";

export function createToolBatchTransition(
  input: {
    toolNames: string[];
    changedPaths?: string[];
  },
  timestamp = new Date().toISOString(),
): RuntimeContinueTransition {
  return {
    action: "continue",
    reason: {
      code: "continue.after_tool_batch",
      toolNames: takeLastUnique(input.toolNames),
      changedPaths: takeLastUnique(input.changedPaths ?? []),
    },
    timestamp,
  };
}

export function createMissingSkillTransition(
  missingSkills: string[],
  timestamp = new Date().toISOString(),
): RuntimeContinueTransition {
  return {
    action: "continue",
    reason: {
      code: "continue.required_skill_load",
      missingSkills: takeLastUnique(missingSkills),
    },
    timestamp,
  };
}

export function createIncompleteTodoTransition(
  incompleteTodoCount: number,
  timestamp = new Date().toISOString(),
): RuntimeContinueTransition {
  return {
    action: "continue",
    reason: {
      code: "continue.incomplete_todos",
      incompleteTodoCount: Math.max(1, Math.trunc(incompleteTodoCount)),
    },
    timestamp,
  };
}

export function createVerificationRequiredTransition(
  state: VerificationState | undefined,
  timestamp = new Date().toISOString(),
): RuntimeContinueTransition {
  return {
    action: "continue",
    reason: {
      code: "continue.verification_required",
      pendingPaths: takeLastUnique(state?.pendingPaths ?? []),
      attempts: clampWholeNumber(state?.attempts, 0, 50, 0) ?? 0,
      reminderCount: clampWholeNumber(state?.reminderCount, 0, 50, 0) ?? 0,
    },
    timestamp,
  };
}

export function createVerificationFailedTransition(
  state: VerificationState | undefined,
  timestamp = new Date().toISOString(),
): RuntimeContinueTransition {
  return {
    action: "continue",
    reason: {
      code: "continue.verification_failed",
      attempts: clampWholeNumber(state?.attempts, 1, 50, 1) ?? 1,
      noProgressCount: clampWholeNumber(state?.noProgressCount, 0, 50, 0) ?? 0,
      lastCommand: normalizeText(state?.lastCommand) || undefined,
      lastKind: normalizeText(state?.lastKind) || undefined,
      lastExitCode: normalizeExitCode(state?.lastExitCode),
    },
    timestamp,
  };
}

export function createAcceptanceRequiredTransition(
  input: {
    phase?: string;
    pendingChecks?: string[];
    stalledPhaseCount?: number;
  },
  timestamp = new Date().toISOString(),
): RuntimeContinueTransition {
  return {
    action: "continue",
    reason: {
      code: "continue.acceptance_required",
      phase: normalizeText(input.phase) || "active",
      pendingChecks: takeLastUnique(input.pendingChecks ?? []),
      stalledPhaseCount: clampWholeNumber(input.stalledPhaseCount, 0, 99, 0) ?? 0,
    },
    timestamp,
  };
}

export function createProviderRecoveryTransition(
  input: {
    consecutiveFailures: number;
    error: unknown;
    configuredModel: string;
    requestModel: string;
    requestConfig: RecoveryRequestConfig;
    delayMs: number;
  },
  timestamp = new Date().toISOString(),
): RuntimeRecoverTransition {
  return {
    action: "recover",
    reason: {
      code: "recover.provider_request_retry",
      consecutiveFailures: Math.max(1, Math.trunc(input.consecutiveFailures)),
      error: truncate(normalizeText((input.error as { message?: unknown })?.message ?? input.error) || "request failed"),
      configuredModel: normalizeText(input.configuredModel) || "unknown_model",
      requestModel: normalizeText(input.requestModel) || "unknown_model",
      contextWindowMessages: Math.max(1, Math.trunc(input.requestConfig.contextWindowMessages)),
      maxContextChars: Math.max(1, Math.trunc(input.requestConfig.maxContextChars)),
      contextSummaryChars: Math.max(1, Math.trunc(input.requestConfig.contextSummaryChars)),
      delayMs: Math.max(0, Math.trunc(input.delayMs)),
    },
    timestamp,
  };
}

export function createYieldTransition(
  toolSteps: number,
  limit: number | undefined,
  timestamp = new Date().toISOString(),
): RuntimeYieldTransition {
  return {
    action: "yield",
    reason: {
      code: "yield.tool_step_limit",
      toolSteps: Math.max(1, Math.trunc(toolSteps)),
      limit: typeof limit === "number" && Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : undefined,
    },
    timestamp,
  };
}

export function createVerificationPauseTransition(
  state: VerificationState | undefined,
  timestamp = new Date().toISOString(),
): RuntimePauseTransition {
  return {
    action: "pause",
    reason: {
      code: "pause.verification_awaiting_user",
      pendingPaths: takeLastUnique(state?.pendingPaths ?? []),
      pauseReason:
        normalizeText(state?.pauseReason) ||
        "Verification is awaiting user clarification before finalize can proceed.",
      attempts: clampWholeNumber(state?.attempts, 0, 50, 0) ?? 0,
      reminderCount: clampWholeNumber(state?.reminderCount, 0, 50, 0) ?? 0,
      noProgressCount: clampWholeNumber(state?.noProgressCount, 0, 50, 0) ?? 0,
    },
    timestamp,
  };
}

export function createFinalizeTransition(
  input: {
    changedPaths: Iterable<string>;
    verificationState?: VerificationState;
  },
  timestamp = new Date().toISOString(),
): RuntimeFinalizeTransition {
  const verificationOutcome = input.verificationState?.status === "passed" ? "passed" : "not_required";
  return {
    action: "finalize",
    reason: {
      code: "finalize.completed",
      changedPaths: takeLastUnique([...input.changedPaths]),
      verificationOutcome,
      verificationKind:
        verificationOutcome === "passed" ? normalizeText(input.verificationState?.lastKind) || undefined : undefined,
    },
    timestamp,
  };
}

export function buildRunTurnResult(input: {
  session: SessionRecord;
  changedPaths: Iterable<string>;
  verificationAttempted: boolean;
  verificationPassed?: boolean;
  transition: RuntimeTerminalTransition;
}): RunTurnResult {
  return {
    session: input.session,
    changedPaths: [...input.changedPaths],
    verificationAttempted: input.verificationAttempted,
    verificationPassed: input.verificationPassed,
    yielded: input.transition.action === "yield",
    yieldReason:
      input.transition.action === "yield"
        ? `tool_steps_${input.transition.reason.toolSteps}`
        : undefined,
    paused: input.transition.action === "pause",
    pauseReason:
      input.transition.action === "pause"
        ? input.transition.reason.pauseReason
        : undefined,
    transition: input.transition,
  };
}
