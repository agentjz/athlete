import { isContinuationDirective, isInternalMessage } from "../taskState.js";
import type { SessionCheckpoint, SessionCheckpointPhase, SessionRecord, StoredMessage } from "../../types.js";
import { createCheckpointForObjective, createEmptyCheckpoint, deriveCheckpointFromSession } from "./base.js";
import {
  buildToolBatch,
  deriveCompletedSteps,
  deriveCurrentStep,
  deriveNextStep,
  derivePendingPathArtifacts,
} from "./derivation.js";
import {
  fingerprintObjective,
  mergeArtifacts,
  normalizeArtifacts,
  normalizeFlow,
  normalizeText,
  normalizeTimestamp,
  normalizeToolBatch,
  takeLastUnique,
} from "./shared.js";

export { createEmptyCheckpoint } from "./base.js";

interface ToolBatchUpdateInput {
  toolNames: string[];
  toolMessages: StoredMessage[];
  changedPaths?: string[];
}

export function normalizeCheckpoint(
  checkpoint: SessionCheckpoint | undefined,
  timestamp = new Date().toISOString(),
): SessionCheckpoint | undefined {
  if (!checkpoint) {
    return undefined;
  }

  const objective = normalizeText(checkpoint.objective) || undefined;
  const status = checkpoint.status === "completed" ? "completed" : "active";

  return {
    version: 1,
    objective,
    objectiveFingerprint:
      normalizeText(checkpoint.objectiveFingerprint) || (objective ? fingerprintObjective(objective) : undefined),
    status,
    completedSteps: takeLastUnique(checkpoint.completedSteps ?? [], 8),
    currentStep: status === "completed" ? undefined : normalizeText(checkpoint.currentStep) || undefined,
    nextStep: status === "completed" ? undefined : normalizeText(checkpoint.nextStep) || undefined,
    recentToolBatch: normalizeToolBatch(checkpoint.recentToolBatch),
    flow: normalizeFlow(checkpoint.flow, status, timestamp),
    priorityArtifacts:
      status === "completed"
        ? []
        : normalizeArtifacts(checkpoint.priorityArtifacts ?? []),
    updatedAt: normalizeTimestamp(checkpoint.updatedAt, timestamp),
  };
}

export function normalizeSessionCheckpoint(session: SessionRecord): SessionRecord {
  const timestamp = new Date().toISOString();
  const objective = normalizeText(session.taskState?.objective) || undefined;
  const fingerprint = objective ? fingerprintObjective(objective) : undefined;
  const normalized = normalizeCheckpoint(session.checkpoint, timestamp);
  const objectiveChanged =
    Boolean(normalized?.objectiveFingerprint && fingerprint) && normalized?.objectiveFingerprint !== fingerprint;

  let checkpoint = objectiveChanged
    ? createCheckpointForObjective(objective, timestamp)
    : normalized ?? deriveCheckpointFromSession(session, timestamp);

  if (objective) {
    checkpoint.objective = objective;
    checkpoint.objectiveFingerprint = fingerprint;
  } else {
    checkpoint.objective = undefined;
    checkpoint.objectiveFingerprint = undefined;
  }

  if (!objectiveChanged && checkpoint.completedSteps.length === 0) {
    checkpoint.completedSteps = deriveCompletedSteps(session);
  }

  if (checkpoint.status !== "completed" && !objectiveChanged) {
    checkpoint.currentStep = checkpoint.currentStep ?? deriveCurrentStep(session, checkpoint);
    checkpoint.nextStep = checkpoint.nextStep ?? deriveNextStep(session, checkpoint);
    checkpoint.priorityArtifacts = mergeArtifacts(
      checkpoint.priorityArtifacts,
      checkpoint.recentToolBatch?.artifacts ?? [],
      derivePendingPathArtifacts(session),
    );
  }

  if (objectiveChanged) {
    checkpoint.status = "active";
    checkpoint.currentStep = undefined;
    checkpoint.nextStep = undefined;
    checkpoint.recentToolBatch = undefined;
    checkpoint.priorityArtifacts = [];
  }

  checkpoint.flow = normalizeFlow(checkpoint.flow, checkpoint.status, timestamp);
  checkpoint.updatedAt = normalizeTimestamp(checkpoint.updatedAt, timestamp);

  return {
    ...session,
    checkpoint,
  };
}

export function noteCheckpointTurnInput(
  session: SessionRecord,
  input: string,
  timestamp = new Date().toISOString(),
): SessionRecord {
  const checkpoint = normalizeSessionCheckpoint(session).checkpoint ?? createEmptyCheckpoint(timestamp);
  const phase: SessionCheckpointPhase =
    isInternalMessage(input)
      ? "continuation"
      : isContinuationDirective(input)
        ? "resume"
        : "active";

  return {
    ...session,
    checkpoint: {
      ...checkpoint,
      flow: {
        phase,
        reason:
          phase === "continuation"
            ? "managed continuation"
            : phase === "resume"
              ? "session resume"
              : undefined,
        updatedAt: timestamp,
      },
      currentStep:
        checkpoint.status === "completed"
          ? undefined
          : checkpoint.currentStep ?? deriveCurrentStep(session, checkpoint),
      nextStep:
        checkpoint.status === "completed"
          ? undefined
          : checkpoint.nextStep ?? deriveNextStep(session, checkpoint),
      updatedAt: timestamp,
    },
  };
}

export function noteCheckpointRecovery(
  session: SessionRecord,
  consecutiveFailures: number,
  error: unknown,
  timestamp = new Date().toISOString(),
): SessionRecord {
  const checkpoint = normalizeSessionCheckpoint(session).checkpoint ?? createEmptyCheckpoint(timestamp);

  if (checkpoint.status === "completed") {
    return {
      ...session,
      checkpoint,
    };
  }

  return {
    ...session,
    checkpoint: {
      ...checkpoint,
      currentStep: checkpoint.currentStep ?? deriveCurrentStep(session, checkpoint) ?? checkpoint.nextStep,
      nextStep:
        checkpoint.nextStep ??
        deriveNextStep(session, checkpoint) ??
        "Retry the next unresolved step from the latest checkpoint instead of restarting.",
      flow: {
        phase: "recovery",
        reason: normalizeText((error as { message?: unknown })?.message ?? error) || undefined,
        recoveryFailures: consecutiveFailures,
        updatedAt: timestamp,
      },
      updatedAt: timestamp,
    },
  };
}

export function noteCheckpointYield(
  session: SessionRecord,
  yieldReason: string | undefined,
  timestamp = new Date().toISOString(),
): SessionRecord {
  const checkpoint = normalizeSessionCheckpoint(session).checkpoint ?? createEmptyCheckpoint(timestamp);

  if (checkpoint.status === "completed") {
    return {
      ...session,
      checkpoint,
    };
  }

  return {
    ...session,
    checkpoint: {
      ...checkpoint,
      currentStep:
        checkpoint.currentStep ??
        deriveCurrentStep(session, checkpoint) ??
        "Paused between tool batches",
      nextStep:
        checkpoint.nextStep ??
        deriveNextStep(session, checkpoint) ??
        "Continue from the latest checkpoint without repeating completed work.",
      flow: {
        phase: "continuation",
        reason: normalizeText(yieldReason) || "yielded between tool batches",
        updatedAt: timestamp,
      },
      updatedAt: timestamp,
    },
  };
}

export function noteCheckpointToolBatch(
  session: SessionRecord,
  input: ToolBatchUpdateInput,
  timestamp = new Date().toISOString(),
): SessionRecord {
  const checkpoint = normalizeSessionCheckpoint(session).checkpoint ?? createEmptyCheckpoint(timestamp);
  const recentToolBatch = buildToolBatch(input.toolNames, input.toolMessages, input.changedPaths, timestamp);
  const phase = checkpoint.flow.phase === "recovery" ? "active" : checkpoint.flow.phase;

  return {
    ...session,
    checkpoint: {
      ...checkpoint,
      completedSteps: deriveCompletedSteps(session),
      currentStep:
        checkpoint.status === "completed"
          ? undefined
          : deriveCurrentStep(session, {
              ...checkpoint,
              recentToolBatch,
            }),
      nextStep:
        checkpoint.status === "completed"
          ? undefined
          : deriveNextStep(session, {
              ...checkpoint,
              recentToolBatch,
            }),
      recentToolBatch,
      priorityArtifacts:
        checkpoint.status === "completed"
          ? []
          : mergeArtifacts(
              recentToolBatch?.artifacts ?? [],
              checkpoint.priorityArtifacts,
              derivePendingPathArtifacts(session),
            ),
      flow: {
        phase,
        reason:
          phase === "active"
            ? undefined
            : checkpoint.flow.reason,
        updatedAt: timestamp,
      },
      updatedAt: timestamp,
    },
  };
}

export function noteCheckpointCompleted(
  session: SessionRecord,
  timestamp = new Date().toISOString(),
): SessionRecord {
  const checkpoint = normalizeSessionCheckpoint(session).checkpoint ?? createEmptyCheckpoint(timestamp);

  return {
    ...session,
    checkpoint: {
      ...checkpoint,
      status: "completed",
      completedSteps:
        checkpoint.completedSteps.length > 0 ? checkpoint.completedSteps : deriveCompletedSteps(session),
      currentStep: undefined,
      nextStep: undefined,
      priorityArtifacts: [],
      flow: {
        phase: "active",
        updatedAt: timestamp,
      },
      updatedAt: timestamp,
    },
  };
}
