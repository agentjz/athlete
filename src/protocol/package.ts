import type { AssignmentContract } from "./assignment.js";
import { normalizeProtocolId, type CapabilityProfile } from "./capability.js";
import { createCapabilityRunnerDescriptor, type CapabilityRunnerDescriptor, type CapabilityRunnerType } from "./runner.js";

export const CAPABILITY_PACKAGE_PROTOCOL = "deadmouse.capability-package" as const;

export type CapabilitySourceKind = string;
export type CapabilityAdapterKind = string;

export interface CapabilityPackageSource {
  kind: CapabilitySourceKind;
  id: string;
  path?: string;
  builtIn: boolean;
}

export interface CapabilityPackageAdapter {
  kind: CapabilityAdapterKind;
  id: string;
  description: string;
}

export interface CapabilityPackageContracts {
  input: "AssignmentContract";
  progress: "ProgressEvent";
  artifact: "ArtifactRef";
  output: "CloseoutContract";
  wake: "WakeSignal";
}

export interface CapabilityPackagePolicies {
  budgetPolicy: string;
  artifactPolicy: string;
  closeoutPolicy: string;
}

export interface CapabilityPackageLeadSummary {
  availability: string;
  useWhen: readonly string[];
  avoidWhen: readonly string[];
}

export interface CapabilityPackageMachinePermissions {
  exposeToLead: true;
  executeExplicitAssignment: true;
  autoSelect: false;
  autoDispatch: false;
  decideStrategy: false;
}

export interface CapabilityPackage {
  protocol: typeof CAPABILITY_PACKAGE_PROTOCOL;
  version: string;
  packageId: string;
  profile: CapabilityProfile;
  source: CapabilityPackageSource;
  adapter: CapabilityPackageAdapter;
  runner: CapabilityRunnerDescriptor;
  contracts: CapabilityPackageContracts;
  policies: CapabilityPackagePolicies;
  leadSummary: CapabilityPackageLeadSummary;
  machinePermissions: CapabilityPackageMachinePermissions;
}

export function createCapabilityPackage(input: {
  packageId?: string;
  version?: string;
  profile: CapabilityProfile;
  source: Omit<CapabilityPackageSource, "id"> & { id?: string };
  adapter: CapabilityPackageAdapter;
  runnerType: CapabilityRunnerType;
  runner?: Partial<Pick<CapabilityRunnerDescriptor, "createsExecution" | "emitsProgress" | "emitsArtifacts" | "emitsCloseout" | "emitsWakeSignal">>;
  budgetPolicy?: string;
  artifactPolicy?: string;
  closeoutPolicy?: string;
  availability?: string;
  useWhen?: readonly string[];
  avoidWhen?: readonly string[];
}): CapabilityPackage {
  const normalizedProfileId = normalizeProtocolId(input.profile.id);
  const packageId = normalizeProtocolId(
    input.packageId ?? (
      normalizedProfileId.startsWith(`${input.profile.kind}.`)
        ? normalizedProfileId
        : `${input.profile.kind}.${normalizedProfileId}`
    ),
  );
  return {
    protocol: CAPABILITY_PACKAGE_PROTOCOL,
    version: input.version?.trim() || "1.0.0",
    packageId,
    profile: input.profile,
    source: {
      ...input.source,
      id: normalizeProtocolId(input.source.id ?? packageId),
    },
    adapter: {
      ...input.adapter,
      id: normalizeProtocolId(input.adapter.id),
    },
    runner: createCapabilityRunnerDescriptor({
      runnerType: input.runnerType,
      createsExecution: input.runner?.createsExecution,
      emitsProgress: input.runner?.emitsProgress,
      emitsArtifacts: input.runner?.emitsArtifacts,
      emitsCloseout: input.runner?.emitsCloseout,
      emitsWakeSignal: input.runner?.emitsWakeSignal,
    }),
    contracts: {
      input: "AssignmentContract",
      progress: "ProgressEvent",
      artifact: "ArtifactRef",
      output: "CloseoutContract",
      wake: "WakeSignal",
    },
    policies: {
      budgetPolicy: input.budgetPolicy?.trim() || input.profile.budgetPolicy,
      artifactPolicy: input.artifactPolicy?.trim() || "Record concrete evidence references when the capability produces observable work.",
      closeoutPolicy: input.closeoutPolicy?.trim() || "Return a CloseoutContract before Lead judges completion.",
    },
    leadSummary: {
      availability: input.availability?.trim() || input.profile.description,
      useWhen: [...(input.useWhen ?? input.profile.bestFor)],
      avoidWhen: [...(input.avoidWhen ?? input.profile.notFor)],
    },
    machinePermissions: {
      exposeToLead: true,
      executeExplicitAssignment: true,
      autoSelect: false,
      autoDispatch: false,
      decideStrategy: false,
    },
  };
}

export function assertCapabilityPackageAcceptsAssignment(
  pkg: CapabilityPackage,
  assignment: AssignmentContract,
): void {
  if (assignment.capabilityId !== pkg.packageId) {
    throw new Error(
      `Assignment '${assignment.assignmentId}' targets capability '${assignment.capabilityId}', not package '${pkg.packageId}'.`,
    );
  }
}

export function formatCapabilityPackageForLead(pkg: CapabilityPackage): string {
  return [
    `- ${pkg.packageId} [${pkg.profile.kind}] ${pkg.profile.name}`,
    `  available: ${pkg.leadSummary.availability}`,
    `  cost: ${pkg.profile.cost}; runner: ${pkg.runner.runnerType}; source: ${pkg.source.kind}`,
    `  input/output: ${pkg.contracts.input} -> ${pkg.contracts.output}`,
  ].join("\n");
}

export function isCapabilitySourceKind(value: unknown): value is CapabilitySourceKind {
  return typeof value === "string" && normalizeProtocolId(value) === value.trim().toLowerCase();
}

export function isCapabilityAdapterKind(value: unknown): value is CapabilityAdapterKind {
  return typeof value === "string" && normalizeProtocolId(value) === value.trim().toLowerCase();
}
