import type { ArtifactKind } from "./artifact.js";
import type { LeadWaitPolicyInput } from "./leadWait.js";
import { type CapabilityRunnerType, isCapabilityRunnerType } from "./runner.js";

export const CAPABILITY_PORT_PROTOCOL = "kitty.capability-port" as const;

export type CapabilityForegroundMode = "foreground_stream" | "inline_events" | "silent";

export interface CapabilityPortRunner {
  type: CapabilityRunnerType;
  invocation: string;
  createsExecution: boolean;
  emitsProgress: boolean;
  emitsArtifacts: boolean;
  emitsCloseout: boolean;
  emitsWakeSignal: boolean;
  leadWaitPolicy?: LeadWaitPolicyInput;
}

export interface CapabilityPermissionBoundary {
  world: string;
  autonomy: string;
  read: readonly string[];
  write: readonly string[];
  forbidden: readonly string[];
}

export interface CapabilityForegroundOutput {
  mode: CapabilityForegroundMode;
  sink: "runtime-ui";
  section: string;
  streams: readonly string[];
}

export interface CapabilityArtifactDeclaration {
  kind: ArtifactKind | string;
  name: string;
  description: string;
  required: boolean;
}

export interface CapabilityCloseoutBehavior {
  required: boolean;
  contract: "CloseoutContract";
  requiredEvidence: readonly string[];
  mergeProposal: "none" | "optional" | "required";
}

export interface CapabilityWakeBehavior {
  required: boolean;
  reasons: readonly string[];
}

export interface CapabilityPort {
  protocol: typeof CAPABILITY_PORT_PROTOCOL;
  autonomyOwner: "ecosystem";
  runner: CapabilityPortRunner;
  permissionBoundary: CapabilityPermissionBoundary;
  foregroundOutput: CapabilityForegroundOutput;
  artifacts: readonly CapabilityArtifactDeclaration[];
  closeout: CapabilityCloseoutBehavior;
  wake: CapabilityWakeBehavior;
}

export interface CapabilityPortInput {
  runner: {
    type: CapabilityRunnerType;
    invocation: string;
    createsExecution?: boolean;
    emitsProgress?: boolean;
    emitsArtifacts?: boolean;
    emitsCloseout?: boolean;
    emitsWakeSignal?: boolean;
    leadWaitPolicy?: LeadWaitPolicyInput;
  };
  permissionBoundary: CapabilityPermissionBoundary;
  foregroundOutput: CapabilityForegroundOutput;
  artifacts: readonly Omit<CapabilityArtifactDeclaration, "required">[] | readonly CapabilityArtifactDeclaration[];
  closeout: CapabilityCloseoutBehavior;
  wake: CapabilityWakeBehavior;
}

export function createCapabilityPort(
  input: CapabilityPortInput,
): CapabilityPort {
  const runnerIdentity = input.runner.type;
  if (!isCapabilityRunnerType(runnerIdentity)) {
    throw new Error(`Unsupported capability runner type '${String(runnerIdentity)}'.`);
  }

  const createsExecution = input.runner.createsExecution !== false;
  const emitsCloseout = input.runner.emitsCloseout ?? input.closeout.required !== false;
  const emitsWakeSignal = input.runner.emitsWakeSignal ?? input.wake.required !== false;

  return {
    protocol: CAPABILITY_PORT_PROTOCOL,
    autonomyOwner: "ecosystem",
    runner: {
      type: runnerIdentity,
      invocation: requireText(input.runner.invocation, "CapabilityPort.runner.invocation"),
      createsExecution,
      emitsProgress: input.runner.emitsProgress ?? createsExecution,
      emitsArtifacts: input.runner.emitsArtifacts ?? input.artifacts.length > 0,
      emitsCloseout,
      emitsWakeSignal,
      leadWaitPolicy: input.runner.leadWaitPolicy,
    },
    permissionBoundary: {
      world: requireText(input.permissionBoundary.world, "CapabilityPort.permissionBoundary.world"),
      autonomy: requireText(input.permissionBoundary.autonomy, "CapabilityPort.permissionBoundary.autonomy"),
      read: normalizeTextList(input.permissionBoundary.read, "CapabilityPort.permissionBoundary.read"),
      write: normalizeTextList(input.permissionBoundary.write, "CapabilityPort.permissionBoundary.write"),
      forbidden: normalizeTextList(input.permissionBoundary.forbidden, "CapabilityPort.permissionBoundary.forbidden"),
    },
    foregroundOutput: {
      mode: normalizeForegroundMode(input.foregroundOutput.mode),
      sink: "runtime-ui",
      section: requireText(input.foregroundOutput.section, "CapabilityPort.foregroundOutput.section"),
      streams: normalizeTextList(input.foregroundOutput.streams, "CapabilityPort.foregroundOutput.streams"),
    },
    artifacts: input.artifacts.map((artifact) => ({
      kind: requireText(artifact.kind, "CapabilityPort.artifacts.kind"),
      name: requireText(artifact.name, "CapabilityPort.artifacts.name"),
      description: requireText(artifact.description, "CapabilityPort.artifacts.description"),
      required: "required" in artifact ? artifact.required !== false : false,
    })),
    closeout: {
      required: input.closeout.required !== false,
      contract: "CloseoutContract",
      requiredEvidence: normalizeTextList(input.closeout.requiredEvidence, "CapabilityPort.closeout.requiredEvidence"),
      mergeProposal: normalizeMergeProposal(input.closeout.mergeProposal),
    },
    wake: {
      required: input.wake.required !== false,
      reasons: normalizeTextList(input.wake.reasons, "CapabilityPort.wake.reasons"),
    },
  };
}

function normalizeForegroundMode(value: unknown): CapabilityForegroundMode {
  if (value === "foreground_stream" || value === "inline_events" || value === "silent") {
    return value;
  }
  throw new Error(`Unsupported CapabilityPort.foregroundOutput.mode '${String(value)}'.`);
}

function normalizeMergeProposal(value: unknown): CapabilityCloseoutBehavior["mergeProposal"] {
  if (value === "none" || value === "optional" || value === "required") {
    return value;
  }
  throw new Error(`Unsupported CapabilityPort.closeout.mergeProposal '${String(value)}'.`);
}

function normalizeTextList(value: readonly unknown[], label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value.map((item) => requireText(item, label));
}

function requireText(value: unknown, label: string): string {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(`${label} is required.`);
  }
  return text;
}
