import assert from "node:assert/strict";
import test from "node:test";

import { createCapabilityProfile } from "../../src/protocol/capability.js";
import {
  createCapabilityPackage,
  diagnoseCapabilityPackages,
  type CapabilityPackageGovernance,
} from "../../src/protocol/package.js";
import {
  createCapabilityPackageFromManifest,
  parseCapabilityPackageManifest,
} from "../../src/protocol/manifest.js";

function makePackage(id: string, input: {
  governance?: Partial<CapabilityPackageGovernance>;
} = {}) {
  const profile = createCapabilityProfile({
    kind: "tool",
    id,
    name: id,
    description: `Package ${id}`,
    extensionPoint: "tests/protocol/capability-package-governance.test.ts",
  });
  return createCapabilityPackage({
    profile,
    source: {
      kind: "tool",
      builtIn: true,
    },
    adapter: {
      kind: "tool",
      id: `${id}.adapter`,
      description: "test adapter",
    },
    runnerType: "tool",
    governance: input.governance,
  });
}

test("capability packages carry explicit governance without granting machine strategy", () => {
  const pkg = makePackage("tool.alpha", {
    governance: {
      enabled: false,
      installed: true,
      installRef: "builtin:alpha",
      dependencies: [{ packageId: "tool.beta", version: ">=1.0.0" }],
      versionConstraints: [{ packageId: "tool.gamma", version: "^2.0.0" }],
      diagnostics: [{ severity: "warning", message: "disabled for test" }],
    },
  });

  assert.equal(pkg.governance.enabled, false);
  assert.equal(pkg.governance.installed, true);
  assert.equal(pkg.governance.dependencies[0]?.packageId, "tool.beta");
  assert.equal(pkg.governance.diagnostics[0]?.severity, "warning");
  assert.equal(pkg.machinePermissions.autoSelect, false);
  assert.equal(pkg.machinePermissions.autoDispatch, false);
  assert.equal(pkg.machinePermissions.decideStrategy, false);
});

test("manifest parsing preserves install governance dependencies and diagnostics", () => {
  const manifest = parseCapabilityPackageManifest({
    protocol: "deadmouse.capability-manifest",
    packageId: "tool.alpha",
    version: "2.1.0",
    kind: "tool",
    id: "tool.alpha",
    name: "Alpha",
    description: "Alpha capability",
    source: { kind: "tool", builtIn: true },
    adapter: { kind: "tool", id: "tool.alpha.adapter", description: "adapter" },
    runnerType: "tool",
    governance: {
      enabled: true,
      installed: true,
      installRef: "builtin:alpha",
      dependencies: [{ packageId: "tool.beta", version: ">=1.0.0" }],
      diagnostics: [{ severity: "info", message: "ready" }],
    },
  });

  const pkg = createCapabilityPackageFromManifest(manifest);
  assert.equal(pkg.version, "2.1.0");
  assert.equal(pkg.governance.enabled, true);
  assert.equal(pkg.governance.installRef, "builtin:alpha");
  assert.equal(pkg.governance.dependencies[0]?.version, ">=1.0.0");
  assert.equal(pkg.governance.diagnostics[0]?.message, "ready");
});

test("capability package diagnostics catch disabled packages duplicate ids and missing dependencies", () => {
  const packages = [
    makePackage("tool.alpha", {
      governance: {
        enabled: false,
        dependencies: [{ packageId: "tool.missing" }],
      },
    }),
    makePackage("tool.alpha"),
  ];

  const report = diagnoseCapabilityPackages(packages);

  assert.equal(report.status, "error");
  assert.equal(report.total, 2);
  assert.equal(report.disabled, 1);
  assert.match(report.findings.map((finding) => finding.message).join("\n"), /Duplicate capability package 'tool.alpha'/);
  assert.match(report.findings.map((finding) => finding.message).join("\n"), /depends on missing package 'tool.missing'/);
  assert.equal(report.findings.some((finding) => finding.severity === "warning" && /disabled/i.test(finding.message)), true);
});

test("capability package diagnostics enforce dependency version constraints", () => {
  const packages = [
    makePackage("tool.alpha", {
      governance: {
        dependencies: [{ packageId: "tool.beta", version: ">=2.0.0" }],
        versionConstraints: [{ packageId: "tool.gamma", version: "^3.1.0" }],
      },
    }),
    makePackage("tool.beta", { governance: { enabled: true } }),
    makePackage("tool.gamma", { governance: { enabled: true } }),
  ].map((pkg) => {
    if (pkg.packageId === "tool.beta") {
      return { ...pkg, version: "1.9.0" };
    }
    if (pkg.packageId === "tool.gamma") {
      return { ...pkg, version: "4.0.0" };
    }
    return pkg;
  });

  const report = diagnoseCapabilityPackages(packages);

  assert.equal(report.status, "error");
  assert.match(report.findings.map((finding) => finding.message).join("\n"), /requires 'tool.beta' version '>=2.0.0'/);
  assert.match(report.findings.map((finding) => finding.message).join("\n"), /requires 'tool.gamma' version '\^3.1.0'/);
});
