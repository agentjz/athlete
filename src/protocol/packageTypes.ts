import type { CapabilityProfile } from "./capability.js";
import type { CapabilityPort } from "./port.js";
import type { CapabilityRunnerDescriptor } from "./runner.js";
import type { CAPABILITY_PACKAGE_PROTOCOL } from "./packageProtocol.js";

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

export interface CapabilityPackageDependency {
  packageId: string;
  version?: string;
  optional?: boolean;
}

export interface CapabilityPackageDiagnostic {
  severity: "info" | "warning" | "error";
  message: string;
  code?: string;
}

export interface CapabilityPackageGovernance {
  enabled: boolean;
  installed: boolean;
  installRef?: string;
  dependencies: readonly CapabilityPackageDependency[];
  versionConstraints: readonly CapabilityPackageDependency[];
  diagnostics: readonly CapabilityPackageDiagnostic[];
}

export interface CapabilityPackage {
  protocol: typeof CAPABILITY_PACKAGE_PROTOCOL;
  version: string;
  packageId: string;
  profile: CapabilityProfile;
  port: CapabilityPort;
  source: CapabilityPackageSource;
  adapter: CapabilityPackageAdapter;
  runner: CapabilityRunnerDescriptor;
  leadSummary: CapabilityPackageLeadSummary;
  machinePermissions: CapabilityPackageMachinePermissions;
  governance: CapabilityPackageGovernance;
}

export interface CapabilityPackageDiagnosisFinding {
  severity: "warning" | "error";
  packageId?: string;
  message: string;
}

export interface CapabilityPackageDiagnosisReport {
  status: "ok" | "warning" | "error";
  total: number;
  enabled: number;
  disabled: number;
  byKind: Record<string, number>;
  findings: CapabilityPackageDiagnosisFinding[];
}
