import { normalizeProtocolId } from "./capability.js";
import type {
  CapabilityPackageDependency,
  CapabilityPackageDiagnostic,
  CapabilityPackageGovernance,
} from "./packageTypes.js";

export function normalizeCapabilityPackageGovernance(
  input: Partial<CapabilityPackageGovernance> | undefined,
): CapabilityPackageGovernance {
  return {
    enabled: input?.enabled !== false,
    installed: input?.installed !== false,
    installRef: normalizeOptionalText(input?.installRef),
    dependencies: normalizeDependencies(input?.dependencies),
    versionConstraints: normalizeDependencies(input?.versionConstraints),
    diagnostics: normalizeDiagnostics(input?.diagnostics),
  };
}

function normalizeDependencies(value: readonly CapabilityPackageDependency[] | undefined): CapabilityPackageDependency[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((dependency) => ({
      packageId: normalizeProtocolId(String(dependency.packageId ?? "")),
      version: normalizeOptionalText(dependency.version),
      optional: dependency.optional === true,
    }))
    .filter((dependency) => dependency.packageId.length > 0);
}

function normalizeDiagnostics(value: readonly CapabilityPackageDiagnostic[] | undefined): CapabilityPackageDiagnostic[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((diagnostic) => ({
      severity: normalizeDiagnosticSeverity(diagnostic.severity),
      message: normalizeOptionalText(diagnostic.message) ?? "",
      code: normalizeOptionalText(diagnostic.code),
    }))
    .filter((diagnostic) => diagnostic.message.length > 0);
}

function normalizeDiagnosticSeverity(value: unknown): CapabilityPackageDiagnostic["severity"] {
  if (value === "error" || value === "warning" || value === "info") {
    return value;
  }
  return "info";
}

function normalizeOptionalText(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}
