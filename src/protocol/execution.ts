import type { AssignmentContract } from "./assignment.js";
import type { CapabilityKind } from "./capability.js";

export const EXECUTION_PROTOCOL = "deadmouse.execution" as const;

export type ProtocolExecutionStatus = "queued" | "running" | "paused" | "completed" | "failed" | "aborted";

export interface ExecutionProtocolRecord {
  protocol: typeof EXECUTION_PROTOCOL;
  executionId: string;
  assignmentId: string;
  capabilityId: string;
  capabilityKind: CapabilityKind;
  status: ProtocolExecutionStatus;
  requestedBy: string;
  actorName: string;
  objective: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  endedAt?: string;
  artifactRefs: readonly string[];
}

export function createExecutionProtocolRecord(input: {
  executionId: string;
  assignment: AssignmentContract;
  capabilityKind: CapabilityKind;
  status?: ProtocolExecutionStatus;
  actorName: string;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string;
  endedAt?: string;
  artifactRefs?: readonly string[];
}): ExecutionProtocolRecord {
  const now = new Date().toISOString();
  return {
    protocol: EXECUTION_PROTOCOL,
    executionId: input.executionId,
    assignmentId: input.assignment.assignmentId,
    capabilityId: input.assignment.capabilityId,
    capabilityKind: input.capabilityKind,
    status: input.status ?? "queued",
    requestedBy: input.assignment.createdBy,
    actorName: input.actorName,
    objective: input.assignment.objective,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    artifactRefs: [...(input.artifactRefs ?? [])],
  };
}
