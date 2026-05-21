import type { LeadWaitPolicy } from "./leadWait.js";
import { normalizeLeadWaitPolicy } from "./leadWait.js";
import type { CapabilityRunnerDescriptor, CapabilityRunnerType } from "./runner.js";

export const EXECUTION_POLICY_PROTOCOL = "kitty.execution-policy" as const;

export interface ExecutionPolicySnapshot {
  protocol: typeof EXECUTION_POLICY_PROTOCOL;
  type: CapabilityRunnerType;
  createsExecution: boolean;
  progressExpected: boolean;
  artifactsExpected: boolean;
  closeoutRequired: boolean;
  wakeRequired: boolean;
  leadWaitPolicy: LeadWaitPolicy;
}

export function createExecutionPolicySnapshot(runner: CapabilityRunnerDescriptor): ExecutionPolicySnapshot {
  return normalizeExecutionPolicySnapshot({
    protocol: EXECUTION_POLICY_PROTOCOL,
    type: runner.type,
    createsExecution: runner.createsExecution,
    progressExpected: runner.emitsProgress,
    artifactsExpected: runner.emitsArtifacts,
    closeoutRequired: runner.emitsCloseout,
    wakeRequired: runner.emitsWakeSignal,
    leadWaitPolicy: runner.leadWaitPolicy,
  });
}

export function normalizeExecutionPolicySnapshot(input: ExecutionPolicySnapshot): ExecutionPolicySnapshot {
  return {
    protocol: EXECUTION_POLICY_PROTOCOL,
    type: String(input.type ?? "").trim() || "worker",
    createsExecution: input.createsExecution !== false,
    progressExpected: input.progressExpected !== false,
    artifactsExpected: input.artifactsExpected !== false,
    closeoutRequired: input.closeoutRequired !== false,
    wakeRequired: input.wakeRequired !== false,
    leadWaitPolicy: normalizeLeadWaitPolicy(input.leadWaitPolicy),
  };
}
