import { normalizeCheckpoint } from "../../checkpoint.js";
import { fingerprintObjective, normalizeText, takeLastUnique } from "../../checkpoint/shared.js";
import { normalizeTodoItems } from "../../session/todos.js";
import type {
  AcceptanceState,
  SessionCheckpoint,
  TaskState,
  TodoItem,
  VerificationState,
} from "../../../types.js";
import type { AgentWorkingMemory, WorkingMemoryVerification } from "./types.js";

const MAX_ACTIVE_FILES = 10;
const MAX_PLANNED_ACTIONS = 8;
const MAX_COMPLETED_ACTIONS = 8;
const MAX_BLOCKERS = 6;
const MAX_TODOS = 12;
const MAX_EVIDENCE_ARTIFACTS = 6;
const MAX_PENDING_CHECKS = 6;

export interface BuildWorkingMemoryInput {
  taskState?: TaskState;
  todoItems?: TodoItem[];
  checkpoint?: SessionCheckpoint;
  verificationState?: VerificationState;
  acceptanceState?: AcceptanceState;
  timestamp?: string;
}

export function buildAgentWorkingMemory(input: BuildWorkingMemoryInput): AgentWorkingMemory {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const objective = normalizeText(input.taskState?.objective) || undefined;
  const checkpoint = normalizeCurrentObjectiveCheckpoint(input.checkpoint, objective, timestamp);
  const verification = normalizeVerification(input.verificationState);
  const acceptance = normalizeAcceptance(input.acceptanceState);

  return {
    version: 1,
    objective,
    objectiveFingerprint: objective ? fingerprintObjective(objective) : undefined,
    activeFiles: takeLastUnique(input.taskState?.activeFiles ?? [], MAX_ACTIVE_FILES),
    plannedActions: takeLastUnique(input.taskState?.plannedActions ?? [], MAX_PLANNED_ACTIONS),
    completedActions: takeLastUnique(
      checkpoint?.completedSteps.length ? checkpoint.completedSteps : input.taskState?.completedActions ?? [],
      MAX_COMPLETED_ACTIONS,
    ),
    blockers: takeLastUnique(input.taskState?.blockers ?? [], MAX_BLOCKERS),
    todos: normalizeTodoItems(input.todoItems).slice(0, MAX_TODOS),
    recentToolBatch: checkpoint?.recentToolBatch
      ? {
          tools: checkpoint.recentToolBatch.tools,
          summary: checkpoint.recentToolBatch.summary,
          changedPaths: checkpoint.recentToolBatch.changedPaths,
          recordedAt: checkpoint.recentToolBatch.recordedAt,
        }
      : undefined,
    evidenceArtifacts: (checkpoint?.evidenceArtifacts ?? []).slice(0, MAX_EVIDENCE_ARTIFACTS),
    verification,
    acceptance,
    checkpointPhase: checkpoint?.flow.reason
      ? `${checkpoint.flow.phase} (${checkpoint.flow.reason})`
      : checkpoint?.flow.phase,
    checkpointStatus: checkpoint?.status,
    updatedAt: latestTimestamp([
      input.taskState?.lastUpdatedAt,
      input.verificationState?.updatedAt,
      input.acceptanceState?.updatedAt,
      checkpoint?.updatedAt,
      timestamp,
    ]),
  };
}

function normalizeCurrentObjectiveCheckpoint(
  checkpoint: SessionCheckpoint | undefined,
  objective: string | undefined,
  timestamp: string,
): SessionCheckpoint | undefined {
  const normalized = normalizeCheckpoint(checkpoint, timestamp);
  if (!normalized || normalized.status === "completed") {
    return undefined;
  }
  if (!objective) {
    return normalized.objective ? undefined : normalized;
  }

  return normalized.objectiveFingerprint === fingerprintObjective(objective)
    ? normalized
    : undefined;
}

function normalizeVerification(state: VerificationState | undefined): WorkingMemoryVerification | undefined {
  if (!state) {
    return undefined;
  }

  const observedPaths = takeLastUnique(state.observedPaths ?? [], 8);
  const hasSignal =
    state.status !== "idle" ||
    observedPaths.length > 0 ||
    state.attempts > 0 ||
    Boolean(state.lastCommand);
  if (!hasSignal) {
    return undefined;
  }

  return {
    status: state.status,
    attempts: Math.max(0, Math.trunc(state.attempts)),
    observedPaths,
    lastCommand: normalizeText(state.lastCommand) || undefined,
    lastKind: normalizeText(state.lastKind) || undefined,
    lastExitCode: state.lastExitCode,
  };
}

function normalizeAcceptance(state: AcceptanceState | undefined): AgentWorkingMemory["acceptance"] | undefined {
  if (!state?.contract) {
    return undefined;
  }

  return {
    kind: state.contract.kind,
    phase: normalizeText(state.currentPhase) || undefined,
    status: state.status,
    pendingChecks: takeLastUnique(state.pendingChecks ?? [], MAX_PENDING_CHECKS),
    lastIssueSummary: normalizeText(state.lastIssueSummary) || undefined,
  };
}

function latestTimestamp(values: Array<string | undefined>): string {
  return values
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? new Date().toISOString();
}
