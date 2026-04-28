import type {
  RuntimeContinueTransition,
  RuntimeFinalizeTransition,
  RuntimePauseTransition,
  RuntimeRecoverTransition,
  RuntimeTransition,
  RuntimeYieldTransition,
} from "../../types.js";
import {
  clampWholeNumber,
  normalizeText,
  normalizeTimestamp,
  takeLastUnique,
  truncate,
} from "./shared.js";

export function normalizeRuntimeTransition(
  transition: RuntimeTransition | undefined,
  timestamp = new Date().toISOString(),
): RuntimeTransition | undefined {
  if (!transition || typeof transition !== "object") {
    return undefined;
  }

  const action = normalizeAction(transition.action);
  const reason = transition.reason;
  const normalizedTimestamp = normalizeTimestamp(transition.timestamp, timestamp);
  if (!reason || typeof reason !== "object") {
    return undefined;
  }

  switch (action) {
    case "continue":
      return normalizeContinueTransition(reason as RuntimeContinueTransition["reason"], normalizedTimestamp);
    case "recover":
      return normalizeRecoverTransition(reason as RuntimeRecoverTransition["reason"], normalizedTimestamp);
    case "yield":
      return normalizeYieldTransition(reason as RuntimeYieldTransition["reason"], normalizedTimestamp);
    case "pause":
      return normalizePauseTransition(reason as RuntimePauseTransition["reason"], normalizedTimestamp);
    case "finalize":
      return normalizeFinalizeTransition(reason as RuntimeFinalizeTransition["reason"], normalizedTimestamp);
    default:
      return undefined;
  }
}

function normalizeContinueTransition(
  reason: RuntimeContinueTransition["reason"],
  timestamp: string,
): RuntimeContinueTransition | undefined {
  switch (reason.code) {
    case "continue.internal_wake":
      return {
        action: "continue",
        reason: {
          code: reason.code,
          source: "managed_wake",
        },
        timestamp,
      };
    case "continue.after_tool_batch": {
      const toolNames = takeLastUnique(reason.toolNames);
      if (toolNames.length === 0) {
        return undefined;
      }
      return {
        action: "continue",
        reason: {
          code: reason.code,
          toolNames,
          changedPaths: takeLastUnique(reason.changedPaths ?? []),
        },
        timestamp,
      };
    }
    case "continue.empty_assistant_response":
      return {
        action: "continue",
        reason: {
          code: reason.code,
        },
        timestamp,
      };
    default:
      return undefined;
  }
}

function normalizeRecoverTransition(
  reason: RuntimeRecoverTransition["reason"],
  timestamp: string,
): RuntimeRecoverTransition | undefined {
  if (reason.code === "recover.post_compaction_degradation") {
    return {
      action: "recover",
      reason: {
        code: reason.code,
        consecutiveFailures: clampWholeNumber(reason.consecutiveFailures, 1, 50, 1) ?? 1,
        noTextStreak: clampWholeNumber(reason.noTextStreak, 1, 50, 1) ?? 1,
        recoveryAttempt: clampWholeNumber(reason.recoveryAttempt, 1, 50, 1) ?? 1,
        maxRecoveryAttempts: clampWholeNumber(reason.maxRecoveryAttempts, 1, 50, 1) ?? 1,
      },
      timestamp,
    };
  }

  if (reason.code !== "recover.provider_request_retry") {
    return undefined;
  }

  return {
    action: "recover",
    reason: {
      code: reason.code,
      consecutiveFailures: clampWholeNumber(reason.consecutiveFailures, 1, 50, 1) ?? 1,
      error: truncate(normalizeText(reason.error) || "request failed"),
      configuredModel: normalizeText(reason.configuredModel) || "unknown_model",
      requestModel: normalizeText(reason.requestModel) || "unknown_model",
      contextWindowMessages: clampWholeNumber(reason.contextWindowMessages, 1, 999, 1) ?? 1,
      maxContextChars: clampWholeNumber(reason.maxContextChars, 1, 1_000_000, 1) ?? 1,
      contextSummaryChars: clampWholeNumber(reason.contextSummaryChars, 1, 1_000_000, 1) ?? 1,
      delayMs: clampWholeNumber(reason.delayMs, 0, 3_600_000, 0) ?? 0,
    },
    timestamp,
  };
}

function normalizeYieldTransition(
  reason: RuntimeYieldTransition["reason"],
  timestamp: string,
): RuntimeYieldTransition | undefined {
  if (reason.code === "yield.delegation_dispatch") {
    return {
      action: "yield",
      reason: {
        code: reason.code,
      },
      timestamp,
    };
  }

  if (reason.code !== "yield.tool_step_limit") {
    return undefined;
  }

  return {
    action: "yield",
    reason: {
      code: reason.code,
      toolSteps: clampWholeNumber(reason.toolSteps, 1, 999, 1) ?? 1,
      limit: clampWholeNumber(reason.limit, 1, 999, undefined),
    },
    timestamp,
  };
}

function normalizePauseTransition(
  reason: RuntimePauseTransition["reason"],
  timestamp: string,
): RuntimePauseTransition | undefined {
  if (reason.code === "pause.provider_recovery_budget_exhausted") {
    return {
      action: "pause",
      reason: {
        code: reason.code,
        pauseReason:
          truncate(
            normalizeText(reason.pauseReason) ||
              "Provider recovery budget was exhausted.",
          ) ||
          "Provider recovery budget was exhausted.",
        attemptsUsed: clampWholeNumber(reason.attemptsUsed, 0, 999, 0) ?? 0,
        maxAttempts: clampWholeNumber(reason.maxAttempts, 1, 999, 1) ?? 1,
        elapsedMs: clampWholeNumber(reason.elapsedMs, 0, 3_600_000, 0) ?? 0,
        maxElapsedMs: clampWholeNumber(reason.maxElapsedMs, 1, 3_600_000, 1) ?? 1,
        lastError: truncate(normalizeText(reason.lastError) || "request failed") || "request failed",
      },
      timestamp,
    };
  }

  if (reason.code === "pause.managed_slice_budget_exhausted") {
    return {
      action: "pause",
      reason: {
        code: reason.code,
        pauseReason:
          truncate(
            normalizeText(reason.pauseReason) ||
              "Managed slice budget was exhausted.",
          ) ||
          "Managed slice budget was exhausted.",
        slicesUsed: clampWholeNumber(reason.slicesUsed, 0, 999, 0) ?? 0,
        maxSlices: clampWholeNumber(reason.maxSlices, 1, 999, 1) ?? 1,
        elapsedMs: clampWholeNumber(reason.elapsedMs, 0, 3_600_000, 0) ?? 0,
        maxElapsedMs: clampWholeNumber(reason.maxElapsedMs, 1, 3_600_000, undefined),
      },
      timestamp,
    };
  }

  if (reason.code === "pause.degradation_recovery_exhausted") {
    return {
      action: "pause",
      reason: {
        code: reason.code,
        pauseReason:
          truncate(
            normalizeText(reason.pauseReason) ||
              "Repeated post-compaction empty responses exhausted formal recovery attempts.",
          ) ||
          "Repeated post-compaction empty responses exhausted formal recovery attempts.",
        noTextStreak: clampWholeNumber(reason.noTextStreak, 1, 50, 1) ?? 1,
        recoveryAttempts: clampWholeNumber(reason.recoveryAttempts, 1, 50, 1) ?? 1,
        maxRecoveryAttempts: clampWholeNumber(reason.maxRecoveryAttempts, 1, 50, 1) ?? 1,
      },
      timestamp,
    };
  }

  return undefined;
}

function normalizeFinalizeTransition(
  reason: RuntimeFinalizeTransition["reason"],
  timestamp: string,
): RuntimeFinalizeTransition | undefined {
  if (reason.code !== "finalize.completed") {
    return undefined;
  }

  return {
    action: "finalize",
    reason: {
      code: reason.code,
      changedPaths: takeLastUnique(reason.changedPaths ?? []),
      verificationOutcome:
        reason.verificationOutcome === "passed"
          ? "passed"
          : reason.verificationOutcome === "failed"
            ? "failed"
            : "not_attempted",
      verificationKind: normalizeText(reason.verificationKind) || undefined,
    },
    timestamp,
  };
}

function normalizeAction(value: unknown): RuntimeTransition["action"] | undefined {
  return value === "continue" || value === "recover" || value === "yield" || value === "pause" || value === "finalize"
    ? value
    : undefined;
}
