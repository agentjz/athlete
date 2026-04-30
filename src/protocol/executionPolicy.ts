import type { LeadWaitPolicy } from "./leadWait.js";
import { normalizeLeadWaitPolicy } from "./leadWait.js";
import type { CapabilityRunnerDescriptor, CapabilityRunnerType } from "./runner.js";

export const EXECUTION_POLICY_PROTOCOL = "deadmouse.execution-policy" as const;

export interface ExecutionPolicySnapshot {
  protocol: typeof EXECUTION_POLICY_PROTOCOL;
  runnerType: CapabilityRunnerType;
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
    runnerType: runner.runnerType,
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
    runnerType: String(input.runnerType ?? "").trim() || "worker",
    createsExecution: input.createsExecution !== false,
    progressExpected: input.progressExpected !== false,
    artifactsExpected: input.artifactsExpected !== false,
    closeoutRequired: input.closeoutRequired !== false,
    wakeRequired: input.wakeRequired !== false,
    leadWaitPolicy: normalizeLeadWaitPolicy(input.leadWaitPolicy),
  };
}
