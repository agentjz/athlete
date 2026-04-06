import type { SessionCheckpoint, SessionRecord } from "../../types.js";
import {
  deriveCompletedSteps,
  deriveCurrentStep,
  deriveNextStep,
  derivePendingPathArtifacts,
  deriveRecentToolBatchFromMessages,
} from "./derivation.js";
import { fingerprintObjective, mergeArtifacts, normalizeText } from "./shared.js";

export function createEmptyCheckpoint(timestamp = new Date().toISOString()): SessionCheckpoint {
  return {
    version: 1,
    status: "active",
    completedSteps: [],
    flow: {
      phase: "active",
      updatedAt: timestamp,
    },
    priorityArtifacts: [],
    updatedAt: timestamp,
  };
}

export function createCheckpointForObjective(
  objective: string | undefined,
  timestamp: string,
): SessionCheckpoint {
  return {
    ...createEmptyCheckpoint(timestamp),
    objective,
    objectiveFingerprint: objective ? fingerprintObjective(objective) : undefined,
  };
}

export function deriveCheckpointFromSession(
  session: SessionRecord,
  timestamp: string,
): SessionCheckpoint {
  const recentToolBatch = deriveRecentToolBatchFromMessages(session.messages, timestamp);

  return {
    ...createCheckpointForObjective(normalizeText(session.taskState?.objective) || undefined, timestamp),
    completedSteps: deriveCompletedSteps(session),
    currentStep: deriveCurrentStep(session, {
      ...createEmptyCheckpoint(timestamp),
      recentToolBatch,
    }),
    nextStep: deriveNextStep(session, {
      ...createEmptyCheckpoint(timestamp),
      recentToolBatch,
    }),
    recentToolBatch,
    priorityArtifacts: mergeArtifacts(
      recentToolBatch?.artifacts ?? [],
      derivePendingPathArtifacts(session),
    ),
  };
}
