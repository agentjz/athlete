import assert from "node:assert/strict";
import test from "node:test";

import { EXTENSION_IDS, type ExtensionToggleConfig } from "../../src/config/extensions.js";
import { listExtensionCapabilityPackages } from "../../src/extensions/capabilities.js";
import { createExtensionRegistry } from "../../src/extensions/index.js";
import { assertCapabilitySurfaceConvergence, createCapabilitySurface } from "../../src/protocol/capabilitySurface.js";
import { diagnoseCapabilityPackages } from "../../src/protocol/package.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";

test("enabled extensions expose governed capability packages that converge with their tools", async (t) => {
  const root = await createTempWorkspace("extension-capability-packages", t);
  const config = createTestRuntimeConfig(root);
  config.extensions = Object.fromEntries(EXTENSION_IDS.map((id) => [id, true])) as ExtensionToggleConfig;
  const registry = createExtensionRegistry(config);
  const packages = listExtensionCapabilityPackages(registry);
  const exposedTools = registry.entries.flatMap((entry) => entry.tools.map((tool) => tool.definition.function.name));
  const surface = createCapabilitySurface(packages);

  assert.deepEqual(packages.map((pkg) => pkg.packageId), EXTENSION_IDS.map((id) => `extension.${id}`));
  assert.equal(packages.every((pkg) => pkg.machinePermissions.decideStrategy === false), true);
  assert.equal(packages.find((pkg) => pkg.packageId === "extension.spec")?.profile.tools.includes("spec_create"), true);
  assert.doesNotThrow(() => assertCapabilitySurfaceConvergence(surface, exposedTools));
});

test("extension capability diagnostics preserve protocol governance", async (t) => {
  const root = await createTempWorkspace("extension-capability-diagnostics", t);
  const config = createTestRuntimeConfig(root);
  config.extensions.spec = true;
  const packages = listExtensionCapabilityPackages(createExtensionRegistry(config));
  const report = diagnoseCapabilityPackages(packages);

  assert.equal(report.status, "ok");
  assert.equal(report.enabled, packages.length);
});
