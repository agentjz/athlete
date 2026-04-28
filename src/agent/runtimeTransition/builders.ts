import type { RecoveryRequestConfig } from "../retryPolicy.js";
import type { ProviderRecoveryBudgetSnapshot } from "../recoveryBudget.js";
import type { RunTurnResult } from "../types.js";
import type { ManagedSliceBudgetSnapshot } from "../turn/managedBudget.js";
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
import { clampWholeNumber, normalizeText, takeLastUnique, truncate } from "./shared.js";

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

export function createEmptyAssistantResponseTransition(
  timestamp = new Date().toISOString(),
): RuntimeContinueTransition {
  return {
    action: "continue",
    reason: {
      code: "continue.empty_assistant_response",
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

export function createCompactionDegradationRecoveryTransition(
  input: {
    consecutiveFailures: number;
    noTextStreak: number;
    recoveryAttempt: number;
    maxRecoveryAttempts: number;
  },
  timestamp = new Date().toISOString(),
) {
  return {
    action: "recover" as const,
    reason: {
      code: "recover.post_compaction_degradation" as const,
      consecutiveFailures: Math.max(1, Math.trunc(input.consecutiveFailures)),
      noTextStreak: Math.max(1, Math.trunc(input.noTextStreak)),
      recoveryAttempt: Math.max(1, Math.trunc(input.recoveryAttempt)),
      maxRecoveryAttempts: Math.max(1, Math.trunc(input.maxRecoveryAttempts)),
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

export function createDelegationDispatchYieldTransition(
  timestamp = new Date().toISOString(),
): RuntimeYieldTransition {
  return {
    action: "yield",
    reason: {
      code: "yield.delegation_dispatch",
    },
    timestamp,
  };
}

export function createProviderRecoveryBudgetPauseTransition(
  snapshot: ProviderRecoveryBudgetSnapshot,
  timestamp = new Date().toISOString(),
): RuntimePauseTransition {
  return {
    action: "pause",
    reason: {
      code: "pause.provider_recovery_budget_exhausted",
      pauseReason:
        `Provider recovery paused after exhausting the configured budget (${snapshot.attemptsUsed}/${snapshot.maxAttempts} attempts, ${snapshot.elapsedMs}/${snapshot.maxElapsedMs}ms).`,
      attemptsUsed: Math.max(0, Math.trunc(snapshot.attemptsUsed)),
      maxAttempts: Math.max(1, Math.trunc(snapshot.maxAttempts)),
      elapsedMs: Math.max(0, Math.trunc(snapshot.elapsedMs)),
      maxElapsedMs: Math.max(1, Math.trunc(snapshot.maxElapsedMs)),
      lastError: normalizeText(snapshot.lastError) || "request failed",
    },
    timestamp,
  };
}

export function createManagedSliceBudgetPauseTransition(
  snapshot: ManagedSliceBudgetSnapshot,
  timestamp = new Date().toISOString(),
): RuntimePauseTransition {
  return {
    action: "pause",
    reason: {
      code: "pause.managed_slice_budget_exhausted",
      pauseReason:
        `Managed continuation paused after exhausting slice budget (${snapshot.slicesUsed}/${snapshot.maxSlices} slices, elapsed ${snapshot.elapsedMs}ms).`,
      slicesUsed: Math.max(0, Math.trunc(snapshot.slicesUsed)),
      maxSlices: Math.max(1, Math.trunc(snapshot.maxSlices)),
      elapsedMs: Math.max(0, Math.trunc(snapshot.elapsedMs)),
      maxElapsedMs: typeof snapshot.maxElapsedMs === "number" && Number.isFinite(snapshot.maxElapsedMs) && snapshot.maxElapsedMs > 0
        ? Math.trunc(snapshot.maxElapsedMs)
        : undefined,
    },
    timestamp,
  };
}

export function createCompactionDegradationPauseTransition(
  input: {
    noTextStreak: number;
    recoveryAttempts: number;
    maxRecoveryAttempts: number;
  },
  timestamp = new Date().toISOString(),
) {
  return {
    action: "pause" as const,
    reason: {
      code: "pause.degradation_recovery_exhausted" as const,
      pauseReason:
        "Repeated post-compaction empty responses exhausted formal recovery attempts. Current objective frame was preserved.",
      noTextStreak: Math.max(1, Math.trunc(input.noTextStreak)),
      recoveryAttempts: Math.max(1, Math.trunc(input.recoveryAttempts)),
      maxRecoveryAttempts: Math.max(1, Math.trunc(input.maxRecoveryAttempts)),
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
  const verificationOutcome =
    input.verificationState?.status === "passed"
      ? "passed"
      : input.verificationState?.status === "failed"
        ? "failed"
        : "not_attempted";
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
        ? input.transition.reason.code === "yield.tool_step_limit"
          ? `tool_steps_${input.transition.reason.toolSteps}`
          : "delegation_dispatch"
        : undefined,
    paused: input.transition.action === "pause",
    pauseReason:
      input.transition.action === "pause"
        ? input.transition.reason.pauseReason
        : undefined,
    transition: input.transition,
  };
}
