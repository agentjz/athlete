import type { AssignmentContract } from "../protocol/assignment.js";
import { createExecutionPolicySnapshot } from "../protocol/executionPolicy.js";
import type { CapabilityPackage } from "../protocol/package.js";
import { assertCapabilityPackageAcceptsAssignment } from "../protocol/package.js";
import { ExecutionStore } from "./store.js";
import type { ExecutionRecord, ExecutionWorktreePolicy } from "./types.js";

export interface CreateExecutionFromAssignmentInput {
  rootDir: string;
  capability: CapabilityPackage;
  assignment: AssignmentContract;
  lane: ExecutionRecord["lane"];
  profile: ExecutionRecord["profile"];
  launch: ExecutionRecord["launch"];
  requestedBy: string;
  actorName: string;
  actorRole?: string;
  taskId?: number;
  objectiveKey?: string;
  objectiveText?: string;
  cwd: string;
  worktreePolicy?: ExecutionWorktreePolicy;
  prompt?: string;
  command?: string;
  timeoutMs?: number;
  stallTimeoutMs?: number;
}

export async function createExecutionFromAssignment(input: CreateExecutionFromAssignmentInput): Promise<ExecutionRecord> {
  assertCapabilityPackageAcceptsAssignment(input.capability, input.assignment);
  if (!input.capability.runner.createsExecution) {
    throw new Error(`Capability '${input.capability.packageId}' does not create executions.`);
  }

  const executionPolicy = createExecutionPolicySnapshot(input.capability.runner);
  return new ExecutionStore(input.rootDir).create({
    lane: input.lane,
    profile: input.profile,
    launch: input.launch,
    requestedBy: input.requestedBy,
    actorName: input.actorName,
    actorRole: input.actorRole,
    taskId: input.taskId,
    objectiveKey: input.objectiveKey,
    objectiveText: input.objectiveText,
    cwd: input.cwd,
    worktreePolicy: input.worktreePolicy,
    prompt: input.prompt,
    command: input.command,
    timeoutMs: input.timeoutMs,
    stallTimeoutMs: input.stallTimeoutMs,
    assignment: input.assignment,
    capabilityPackage: input.capability,
    executionPolicy,
  });
}
