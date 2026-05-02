import type { AssignmentContract } from "./assignment.js";
import { normalizeProtocolId, type CapabilityProfile } from "./capability.js";
import { createCapabilityPort, type CapabilityPortInput } from "./port.js";
import { createCapabilityRunnerDescriptor } from "./runner.js";
import { normalizeCapabilityPackageGovernance } from "./packageGovernance.js";
import { CAPABILITY_PACKAGE_PROTOCOL } from "./packageProtocol.js";
import type {
  CapabilityAdapterKind,
  CapabilityPackage,
  CapabilityPackageAdapter,
  CapabilityPackageGovernance,
  CapabilityPackageSource,
  CapabilitySourceKind,
} from "./packageTypes.js";

export { CAPABILITY_PACKAGE_PROTOCOL } from "./packageProtocol.js";
export type {
  CapabilityAdapterKind,
  CapabilityPackage,
  CapabilityPackageAdapter,
  CapabilityPackageDependency,
  CapabilityPackageDiagnosisFinding,
  CapabilityPackageDiagnosisReport,
  CapabilityPackageDiagnostic,
  CapabilityPackageGovernance,
  CapabilityPackageLeadSummary,
  CapabilityPackageMachinePermissions,
  CapabilityPackageSource,
  CapabilitySourceKind,
} from "./packageTypes.js";
export { diagnoseCapabilityPackages } from "./packageDiagnosis.js";

export function createCapabilityPackage(input: {
  packageId?: string;
  version?: string;
  profile: CapabilityProfile;
  source: Omit<CapabilityPackageSource, "id"> & { id?: string };
  adapter: CapabilityPackageAdapter;
  port: CapabilityPortInput;
  availability?: string;
  useWhen?: readonly string[];
  avoidWhen?: readonly string[];
  governance?: Partial<CapabilityPackageGovernance>;
}): CapabilityPackage {
  const normalizedProfileId = normalizeProtocolId(input.profile.id);
  const packageId = normalizeProtocolId(
    input.packageId ?? (
      normalizedProfileId.startsWith(`${input.profile.kind}.`)
        ? normalizedProfileId
        : `${input.profile.kind}.${normalizedProfileId}`
    ),
  );
  const port = createCapabilityPort(input.port);
  return {
    protocol: CAPABILITY_PACKAGE_PROTOCOL,
    version: input.version?.trim() || "1.0.0",
    packageId,
    profile: input.profile,
    port,
    source: {
      ...input.source,
      id: normalizeProtocolId(input.source.id ?? packageId),
    },
    adapter: {
      ...input.adapter,
      id: normalizeProtocolId(input.adapter.id),
    },
    runner: createCapabilityRunnerDescriptor({
      type: port.runner.type,
      createsExecution: port.runner.createsExecution,
      emitsProgress: port.runner.emitsProgress,
      emitsArtifacts: port.runner.emitsArtifacts,
      emitsCloseout: port.runner.emitsCloseout,
      emitsWakeSignal: port.runner.emitsWakeSignal,
      leadWaitPolicy: port.runner.leadWaitPolicy,
    }),
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
    governance: normalizeCapabilityPackageGovernance(input.governance),
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
    `  cost: ${pkg.profile.cost}; runner: ${pkg.runner.type}; source: ${pkg.source.kind}`,
    `  port: ${pkg.port.permissionBoundary.world}; output: ${pkg.port.closeout.contract}; wake: ${pkg.port.wake.required ? "required" : "optional"}`,
  ].join("\n");
}

export function isCapabilitySourceKind(value: unknown): value is CapabilitySourceKind {
  return typeof value === "string" && normalizeProtocolId(value) === value.trim().toLowerCase();
}

export function isCapabilityAdapterKind(value: unknown): value is CapabilityAdapterKind {
  return typeof value === "string" && normalizeProtocolId(value) === value.trim().toLowerCase();
}
