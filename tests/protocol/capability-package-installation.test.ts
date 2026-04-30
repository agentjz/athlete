import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createRuntimeCapabilityRegistry } from "../../src/capabilities/registry.js";
import { discoverCapabilityPackages } from "../../src/capabilities/packages/discovery.js";
import { createTempWorkspace } from "../helpers.js";

test("manifest capability packages are installable discoverable disableable and diagnosable", async (t) => {
  const root = await createTempWorkspace("capability-package-install", t);
  const packageDir = path.join(root, ".deadmouse", "capabilities");
  await fs.mkdir(packageDir, { recursive: true });
  await fs.writeFile(
    path.join(packageDir, "analysis.capability.json"),
    JSON.stringify({
      protocol: "deadmouse.capability-manifest",
      packageId: "workflow.analysis",
      version: "3.2.1",
      kind: "workflow",
      id: "analysis",
      name: "Analysis workflow",
      description: "Installed analysis workflow",
      source: {
        kind: "workflow",
        path: ".deadmouse/capabilities/analysis.capability.json",
        builtIn: false,
      },
      adapter: {
        kind: "workflow",
        id: "workflow.analysis.adapter",
        description: "Installed manifest adapter",
      },
      runnerType: "workflow",
      governance: {
        enabled: true,
        installed: true,
        installRef: "file:analysis.capability.json",
        dependencies: [],
        diagnostics: [{ severity: "info", message: "installed" }],
      },
    }),
    "utf8",
  );
  await fs.writeFile(
    path.join(packageDir, "disabled.capability.json"),
    JSON.stringify({
      protocol: "deadmouse.capability-manifest",
      packageId: "workflow.disabled",
      kind: "workflow",
      id: "disabled",
      name: "Disabled workflow",
      description: "Disabled workflow",
      source: { kind: "workflow", builtIn: false },
      adapter: { kind: "workflow", id: "workflow.disabled.adapter", description: "adapter" },
      runnerType: "workflow",
      governance: {
        enabled: false,
        installed: true,
        diagnostics: [{ severity: "warning", message: "disabled by manifest" }],
      },
    }),
    "utf8",
  );

  const discovered = await discoverCapabilityPackages(root);
  const registry = createRuntimeCapabilityRegistry({
    packageProviders: [{ listCapabilityPackages: () => discovered }],
  });
  const packages = registry.list();

  assert.equal(packages.some((pkg) => pkg.packageId === "workflow.analysis"), true);
  assert.equal(packages.some((pkg) => pkg.packageId === "workflow.disabled"), false);
  assert.equal(discovered.find((pkg) => pkg.packageId === "workflow.disabled")?.governance.enabled, false);
});
