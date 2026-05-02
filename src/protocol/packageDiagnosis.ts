import type {
  CapabilityPackage,
  CapabilityPackageDiagnosisFinding,
  CapabilityPackageDiagnosisReport,
} from "./packageTypes.js";
import { satisfiesVersionConstraint } from "./packageVersion.js";

export function diagnoseCapabilityPackages(packages: readonly CapabilityPackage[]): CapabilityPackageDiagnosisReport {
  const findings: CapabilityPackageDiagnosisFinding[] = [];
  const byKind: Record<string, number> = {};
  const packageIds = new Map<string, number>();
  let enabled = 0;
  let disabled = 0;

  for (const pkg of packages) {
    byKind[pkg.profile.kind] = (byKind[pkg.profile.kind] ?? 0) + 1;
    packageIds.set(pkg.packageId, (packageIds.get(pkg.packageId) ?? 0) + 1);
    collectPackageShapeFindings(pkg, findings);
    if (pkg.governance.enabled) {
      enabled += 1;
    } else {
      disabled += 1;
    }
  }

  collectDuplicateFindings(packageIds, findings);
  collectDependencyFindings(packages, findings);

  return {
    status: findings.some((finding) => finding.severity === "error")
      ? "error"
      : findings.length > 0
        ? "warning"
        : "ok",
    total: packages.length,
    enabled,
    disabled,
    byKind,
    findings,
  };
}

function collectPackageShapeFindings(
  pkg: CapabilityPackage,
  findings: CapabilityPackageDiagnosisFinding[],
): void {
  if (!pkg.governance.enabled) {
    findings.push({
      severity: "warning",
      packageId: pkg.packageId,
      message: `Capability package '${pkg.packageId}' is disabled.`,
    });
  }

  if (!pkg.version.trim()) {
    findings.push({
      severity: "error",
      packageId: pkg.packageId,
      message: `Capability package '${pkg.packageId}' has no version.`,
    });
  }

  if (!pkg.source.kind || !pkg.adapter.kind || !pkg.runner.type) {
    findings.push({
      severity: "error",
      packageId: pkg.packageId,
      message: `Capability package '${pkg.packageId}' has incomplete source adapter or runner metadata.`,
    });
  }

  if (pkg.port.runner.type !== pkg.runner.type) {
    findings.push({
      severity: "error",
      packageId: pkg.packageId,
      message: `Capability package '${pkg.packageId}' port runner '${pkg.port.runner.type}' does not match runner '${pkg.runner.type}'.`,
    });
  }

  if (!pkg.port.permissionBoundary.world || !pkg.port.permissionBoundary.autonomy) {
    findings.push({
      severity: "error",
      packageId: pkg.packageId,
      message: `Capability package '${pkg.packageId}' has incomplete port permission boundary.`,
    });
  }

  if (pkg.port.foregroundOutput.sink !== "runtime-ui") {
    findings.push({
      severity: "error",
      packageId: pkg.packageId,
      message: `Capability package '${pkg.packageId}' does not dock foreground output through runtime-ui.`,
    });
  }

  if (pkg.runner.createsExecution && !pkg.runner.emitsCloseout) {
    findings.push({
      severity: "error",
      packageId: pkg.packageId,
      message: `Capability package '${pkg.packageId}' creates execution without closeout emission.`,
    });
  }

  if (pkg.machinePermissions.autoSelect || pkg.machinePermissions.autoDispatch || pkg.machinePermissions.decideStrategy) {
    findings.push({
      severity: "error",
      packageId: pkg.packageId,
      message: `Capability package '${pkg.packageId}' grants machine strategy permissions.`,
    });
  }

  for (const diagnostic of pkg.governance.diagnostics) {
    if (diagnostic.severity === "warning" || diagnostic.severity === "error") {
      findings.push({
        severity: diagnostic.severity,
        packageId: pkg.packageId,
        message: diagnostic.message,
      });
    }
  }
}

function collectDuplicateFindings(
  packageIds: Map<string, number>,
  findings: CapabilityPackageDiagnosisFinding[],
): void {
  for (const [packageId, count] of packageIds) {
    if (count > 1) {
      findings.push({
        severity: "error",
        packageId,
        message: `Duplicate capability package '${packageId}' registered ${count} times.`,
      });
    }
  }
}

function collectDependencyFindings(
  packages: readonly CapabilityPackage[],
  findings: CapabilityPackageDiagnosisFinding[],
): void {
  for (const pkg of packages) {
    for (const dependency of pkg.governance.dependencies) {
      const resolved = packages.find((candidate) => candidate.packageId === dependency.packageId);
      if (!dependency.optional && !resolved) {
        findings.push({
          severity: "error",
          packageId: pkg.packageId,
          message: `Capability package '${pkg.packageId}' depends on missing package '${dependency.packageId}'.`,
        });
        continue;
      }
      if (resolved && dependency.version && !satisfiesVersionConstraint(resolved.version, dependency.version)) {
        findings.push({
          severity: "error",
          packageId: pkg.packageId,
          message: `Capability package '${pkg.packageId}' requires '${dependency.packageId}' version '${dependency.version}', found '${resolved.version}'.`,
        });
      }
    }

    for (const constraint of pkg.governance.versionConstraints) {
      const resolved = packages.find((candidate) => candidate.packageId === constraint.packageId);
      if (resolved && constraint.version && !satisfiesVersionConstraint(resolved.version, constraint.version)) {
        findings.push({
          severity: "error",
          packageId: pkg.packageId,
          message: `Capability package '${pkg.packageId}' requires '${constraint.packageId}' version '${constraint.version}', found '${resolved.version}'.`,
        });
      }
    }
  }
}
