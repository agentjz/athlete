import type {
  SpecCheckpointRecord,
  SpecDocumentName,
  SpecStage,
  SpecState,
  SpecStatus,
  SpecTaskStatus,
} from "./types.js";

export const SPEC_DOCUMENT_NAMES: readonly SpecDocumentName[] = ["requirements", "design", "tasks", "notes"];
export const SPEC_STAGES: readonly SpecStage[] = ["requirements", "design", "tasks", "implement", "validate", "archive"];
export const SPEC_STATUSES: readonly SpecStatus[] = ["active", "paused", "archived", "abandoned"];
export const SPEC_TASK_STATUSES: readonly SpecTaskStatus[] = ["pending", "in_progress", "completed", "blocked"];

export function normalizeSpecState(value: unknown): SpecState {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid spec state.");
  }
  const state = value as SpecState;
  if (state.schemaVersion !== 1 || typeof state.id !== "string") {
    throw new Error("Unsupported spec state schema.");
  }
  assertSpecStage(state.stage);
  assertSpecStatus(state.status);
  return {
    ...state,
    sessionIds: Array.isArray(state.sessionIds) ? state.sessionIds.filter((item) => typeof item === "string") : [],
    confirmed: {
      requirements: Boolean(state.confirmed?.requirements),
      design: Boolean(state.confirmed?.design),
      tasks: Boolean(state.confirmed?.tasks),
    },
    tasks: state.tasks && typeof state.tasks === "object" ? state.tasks : {},
    metadata: state.metadata && typeof state.metadata === "object" ? state.metadata : {},
  };
}

export function normalizeSpecCheckpoint(value: unknown): SpecCheckpointRecord {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid checkpoint.");
  }
  const checkpoint = value as SpecCheckpointRecord;
  if (typeof checkpoint.id !== "string" || typeof checkpoint.label !== "string") {
    throw new Error("Invalid checkpoint.");
  }
  assertSpecStage(checkpoint.stage);
  assertSpecStatus(checkpoint.status);
  return checkpoint;
}

export function assertSpecDocumentName(value: string): asserts value is SpecDocumentName {
  if (!SPEC_DOCUMENT_NAMES.includes(value as SpecDocumentName)) {
    throw new Error(`Unknown spec document: ${value}`);
  }
}

export function assertSpecStage(value: string): asserts value is SpecStage {
  if (!SPEC_STAGES.includes(value as SpecStage)) {
    throw new Error(`Unknown spec stage: ${value}`);
  }
}

export function assertSpecStatus(value: string): asserts value is SpecStatus {
  if (!SPEC_STATUSES.includes(value as SpecStatus)) {
    throw new Error(`Unknown spec status: ${value}`);
  }
}

export function assertSpecTaskStatus(value: string): asserts value is SpecTaskStatus {
  if (!SPEC_TASK_STATUSES.includes(value as SpecTaskStatus)) {
    throw new Error(`Unknown spec task status: ${value}`);
  }
}
