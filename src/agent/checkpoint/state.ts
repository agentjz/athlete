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
  const normalized = normalizeCheckpoint(session.checkpoint, timestamp);
  const checkpoint = normalized ?? deriveCheckpointFromSession(session, timestamp);

  if (checkpoint.completedSteps.length === 0) {
    checkpoint.completedSteps = deriveCompletedSteps(session);
  }

  if (checkpoint.status !== "completed") {
    checkpoint.priorityArtifacts = mergeArtifacts(
      checkpoint.priorityArtifacts,
      checkpoint.recentToolBatch?.artifacts ?? [],
    );
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
        runState: checkpoint.status === "completed"
          ? {
              status: "idle",
              source: "checkpoint",
            }
          : {
              status: "busy",
              source: "turn",
            },
        defaultPhase: "active",
        timestamp,
      }),
      updatedAt: timestamp,
    },
  };
}

export function resolveCurrentObjectiveCheckpoint(
  session: SessionRecord,
  timestamp = new Date().toISOString(),
): SessionCheckpoint {
  const objective = normalizeText(session.taskState?.objective) || undefined;
  const fingerprint = objective ? fingerprintObjective(objective) : undefined;
  const checkpoint = normalizeCheckpoint(session.checkpoint, timestamp) ?? createEmptyCheckpoint(timestamp);

  if (!objective) {
    return checkpoint;
  }

  if (checkpoint.objectiveFingerprint === fingerprint) {
    return checkpoint;
  }

  return createCheckpointForObjective(objective, timestamp);
}

export function noteCheckpointToolBatch(
  session: SessionRecord,
  input: ToolBatchUpdateInput,
  timestamp = new Date().toISOString(),
): SessionRecord {
  const checkpoint = resolveCurrentObjectiveCheckpoint(session, timestamp);
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
      recentToolBatch,
      priorityArtifacts:
        checkpoint.status === "completed"
          ? []
          : mergeArtifacts(
              recentToolBatch?.artifacts ?? [],
              checkpoint.priorityArtifacts,
            ),
      flow: buildCheckpointFlow({
        current: checkpoint.flow,
        status: checkpoint.status,
        transition,
        defaultPhase: phase,
        timestamp,
      }),
      updatedAt: timestamp,
    },
  };
}
