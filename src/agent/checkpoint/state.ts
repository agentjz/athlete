import {
  buildCheckpointFlow,
  createToolBatchTransition,
  getTurnInputTransition,
  normalizeCheckpointFlow,
} from "../runtimeTransition.js";
import type { SessionCheckpoint, SessionRecord, StoredMessage } from "../../types.js";
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
    flow: normalizeCheckpointFlow(checkpoint.flow, status, timestamp),
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

  checkpoint.flow = normalizeCheckpointFlow(checkpoint.flow, checkpoint.status, timestamp);
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
  const transition = getTurnInputTransition(input, timestamp);

  return {
    ...session,
    checkpoint: {
      ...checkpoint,
      flow: buildCheckpointFlow({
        current: checkpoint.flow,
        status: checkpoint.status,
        transition,
        fallbackPhase: "active",
        timestamp,
      }),
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

export function noteCheckpointToolBatch(
  session: SessionRecord,
  input: ToolBatchUpdateInput,
  timestamp = new Date().toISOString(),
): SessionRecord {
  const checkpoint = normalizeSessionCheckpoint(session).checkpoint ?? createEmptyCheckpoint(timestamp);
  const recentToolBatch = buildToolBatch(input.toolNames, input.toolMessages, input.changedPaths, timestamp);
  const phase = checkpoint.flow.phase === "recovery" ? "active" : checkpoint.flow.phase;
  const transition = createToolBatchTransition({
    toolNames: input.toolNames,
    changedPaths: input.changedPaths,
  }, timestamp);

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
      flow: buildCheckpointFlow({
        current: checkpoint.flow,
        status: checkpoint.status,
        transition,
        fallbackPhase: phase,
        timestamp,
      }),
      updatedAt: timestamp,
    },
  };
}
