import { buildCheckpointFlow } from "../runtimeTransition.js";
import type {
  RuntimeFinalizeTransition,
  RuntimeRecoverTransition,
  RuntimeTransition,
  RuntimeYieldTransition,
  SessionRecord,
} from "../../types.js";
import { createEmptyCheckpoint } from "./base.js";
import { deriveCompletedSteps, deriveCurrentStep, deriveNextStep } from "./derivation.js";
import { normalizeSessionCheckpoint } from "./state.js";

export function noteCheckpointTransition(
  session: SessionRecord,
  transition: RuntimeTransition,
  timestamp = new Date().toISOString(),
): SessionRecord {
  const checkpoint = normalizeSessionCheckpoint(session).checkpoint ?? createEmptyCheckpoint(timestamp);

  return {
    ...session,
    checkpoint: {
      ...checkpoint,
      flow: buildCheckpointFlow({
        current: checkpoint.flow,
        status: checkpoint.status,
        transition,
        fallbackPhase: checkpoint.flow.phase,
        timestamp,
      }),
      updatedAt: timestamp,
    },
  };
}

export function noteCheckpointRecovery(
  session: SessionRecord,
  transition: RuntimeRecoverTransition,
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
      flow: buildCheckpointFlow({
        current: checkpoint.flow,
        status: checkpoint.status,
        transition,
        fallbackPhase: "recovery",
        timestamp,
      }),
      updatedAt: timestamp,
    },
  };
}

export function noteCheckpointYield(
  session: SessionRecord,
  transition: RuntimeYieldTransition,
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
      flow: buildCheckpointFlow({
        current: checkpoint.flow,
        status: checkpoint.status,
        transition,
        fallbackPhase: "continuation",
        timestamp,
      }),
      updatedAt: timestamp,
    },
  };
}

export function noteCheckpointCompleted(
  session: SessionRecord,
  transition: RuntimeFinalizeTransition | undefined,
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
      flow: buildCheckpointFlow({
        current: checkpoint.flow,
        status: "completed",
        transition,
        fallbackPhase: "active",
        timestamp,
      }),
      updatedAt: timestamp,
    },
  };
}
