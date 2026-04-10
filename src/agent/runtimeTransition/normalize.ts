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
  normalizeExitCode,
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
    case "continue.resume_from_checkpoint":
      return {
        action: "continue",
        reason: {
          code: reason.code,
          source: reason.source === "resume_directive" ? "resume_directive" : "managed_continuation",
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
    case "continue.required_skill_load": {
      const missingSkills = takeLastUnique(reason.missingSkills);
      if (missingSkills.length === 0) {
        return undefined;
      }
      return {
        action: "continue",
        reason: {
          code: reason.code,
          missingSkills,
        },
        timestamp,
      };
    }
    case "continue.incomplete_todos":
      return {
        action: "continue",
        reason: {
          code: reason.code,
          incompleteTodoCount: clampWholeNumber(reason.incompleteTodoCount, 1, 99, 1) ?? 1,
        },
        timestamp,
      };
    case "continue.verification_required":
      return {
        action: "continue",
        reason: {
          code: reason.code,
          pendingPaths: takeLastUnique(reason.pendingPaths ?? []),
          attempts: clampWholeNumber(reason.attempts, 0, 50, 0) ?? 0,
          reminderCount: clampWholeNumber(reason.reminderCount, 0, 50, 0) ?? 0,
        },
        timestamp,
      };
    case "continue.verification_failed":
      return {
        action: "continue",
        reason: {
          code: reason.code,
          attempts: clampWholeNumber(reason.attempts, 1, 50, 1) ?? 1,
          noProgressCount: clampWholeNumber(reason.noProgressCount, 0, 50, 0) ?? 0,
          lastCommand: normalizeText(reason.lastCommand) || undefined,
          lastKind: normalizeText(reason.lastKind) || undefined,
          lastExitCode: normalizeExitCode(reason.lastExitCode),
        },
        timestamp,
      };
    case "continue.acceptance_required":
      return {
        action: "continue",
        reason: {
          code: reason.code,
          phase: normalizeText(reason.phase) || "active",
          pendingChecks: takeLastUnique(reason.pendingChecks ?? []),
          stalledPhaseCount: clampWholeNumber(reason.stalledPhaseCount, 0, 99, 0) ?? 0,
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
  if (reason.code !== "pause.verification_awaiting_user") {
    return undefined;
  }

  return {
    action: "pause",
    reason: {
      code: reason.code,
      pendingPaths: takeLastUnique(reason.pendingPaths ?? []),
      pauseReason:
        truncate(normalizeText(reason.pauseReason) || "Verification is awaiting user clarification.") ||
        "Verification is awaiting user clarification.",
      attempts: clampWholeNumber(reason.attempts, 0, 50, 0) ?? 0,
      reminderCount: clampWholeNumber(reason.reminderCount, 0, 50, 0) ?? 0,
      noProgressCount: clampWholeNumber(reason.noProgressCount, 0, 50, 0) ?? 0,
    },
    timestamp,
  };
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
      verificationOutcome: reason.verificationOutcome === "passed" ? "passed" : "not_required",
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
