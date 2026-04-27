export const CAPABILITY_RUNNER_PROTOCOL = "deadmouse.capability-runner" as const;

export type CapabilityRunnerType = string;

export interface CapabilityRunnerDescriptor {
  protocol: typeof CAPABILITY_RUNNER_PROTOCOL;
  runnerType: CapabilityRunnerType;
  requiresAssignment: true;
  decisionOwner: "lead";
  createsExecution: boolean;
  emitsProgress: boolean;
  emitsArtifacts: boolean;
  emitsCloseout: boolean;
  emitsWakeSignal: boolean;
  machineMaySelect: false;
  machineMayAutoDispatch: false;
}

export interface CapabilityRunnerContext {
  rootDir: string;
  cwd: string;
  requestedBy: "lead";
}

export interface CapabilityRunnerResult {
  executionId: string;
  status: "started" | "completed" | "failed" | "blocked";
  closeoutRef?: string;
  artifactRefs: readonly string[];
  wakeSignalPublished: boolean;
}

export interface CapabilityRunner<TAssignment> {
  readonly descriptor: CapabilityRunnerDescriptor;
  executeAssignment(assignment: TAssignment, context: CapabilityRunnerContext): Promise<CapabilityRunnerResult>;
}

export function createCapabilityRunnerDescriptor(input: {
  runnerType: CapabilityRunnerType;
  createsExecution?: boolean;
  emitsProgress?: boolean;
  emitsArtifacts?: boolean;
  emitsCloseout?: boolean;
  emitsWakeSignal?: boolean;
}): CapabilityRunnerDescriptor {
  return {
    protocol: CAPABILITY_RUNNER_PROTOCOL,
    runnerType: input.runnerType,
    requiresAssignment: true,
    decisionOwner: "lead",
    createsExecution: input.createsExecution ?? true,
    emitsProgress: input.emitsProgress ?? true,
    emitsArtifacts: input.emitsArtifacts ?? true,
    emitsCloseout: input.emitsCloseout ?? true,
    emitsWakeSignal: input.emitsWakeSignal ?? true,
    machineMaySelect: false,
    machineMayAutoDispatch: false,
  };
}

export function isCapabilityRunnerType(value: unknown): value is CapabilityRunnerType {
  return typeof value === "string" && /^[a-z][a-z0-9._-]*$/.test(value);
}
