import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { buildCliProgram } from "../../src/cli.js";
import { discoverCapabilityPackages } from "../../src/capabilities/packages/discovery.js";
import { createTestRuntimeConfig, createTempWorkspace } from "../helpers.js";
import { captureStdout, parseCommander } from "../observability.helpers.js";

test("capability package cli installs disables enables diagnoses and tests local package manifests", async (t) => {
  const root = await createTempWorkspace("capability-package-cli", t);
  const config = createTestRuntimeConfig(root);
  const sourceManifest = path.join(root, "analysis.capability.json");
  await fs.writeFile(sourceManifest, JSON.stringify({
    protocol: "kitty.capability-manifest",
    packageId: "workflow.analysis",
    version: "1.0.0",
    kind: "workflow",
    id: "analysis",
    name: "Analysis workflow",
    description: "Installed analysis workflow",
    source: { kind: "workflow", builtIn: false },
    adapter: { kind: "workflow", id: "workflow.analysis.adapter", description: "adapter" },
    port: {
      runner: { type: "workflow", invocation: "Lead-selected CLI workflow runner." },
      permissionBoundary: {
        world: "CLI workflow lane",
        autonomy: "workflow owns internal method",
        read: ["assigned context"],
        write: ["workflow artifacts"],
        forbidden: ["machine strategy"],
      },
      foregroundOutput: {
        mode: "inline_events",
        sink: "runtime-ui",
        section: "workflow",
        streams: ["progress", "closeout"],
      },
      artifacts: [{ kind: "execution", name: "workflow-execution", description: "workflow execution" }],
      closeout: {
        required: true,
        requiredEvidence: ["workflow evidence"],
        mergeProposal: "none",
      },
      wake: {
        required: true,
        reasons: ["completed", "failed"],
      },
    },
    governance: {
      enabled: true,
      installed: true,
      diagnostics: [{ severity: "info", message: "ready" }],
    },
  }), "utf8");

  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: root,
      config,
      paths: config.paths,
      overrides: {},
    }),
  });

  const installOutput = await captureStdout(async () => {
    await parseCommander(program, ["capability", "package", "install", sourceManifest]);
  });
  assert.match(installOutput, /workflow.analysis/);

  let packages = await discoverCapabilityPackages(root);
  assert.equal(packages.find((pkg) => pkg.packageId === "workflow.analysis")?.governance.enabled, true);

  const listOutput = await captureStdout(async () => {
    await parseCommander(program, ["capability", "package", "list"]);
  });
  assert.match(listOutput, /workflow.analysis/);
  assert.match(listOutput, /enabled/);

  await parseCommander(program, ["capability", "package", "disable", "workflow.analysis"]);
  packages = await discoverCapabilityPackages(root);
  assert.equal(packages.find((pkg) => pkg.packageId === "workflow.analysis")?.governance.enabled, false);

  await parseCommander(program, ["capability", "package", "enable", "workflow.analysis"]);
  packages = await discoverCapabilityPackages(root);
  assert.equal(packages.find((pkg) => pkg.packageId === "workflow.analysis")?.governance.enabled, true);

  const doctorOutput = await captureStdout(async () => {
    await parseCommander(program, ["capability", "package", "doctor"]);
  });
  assert.match(doctorOutput, /capability packages: ok/i);

  const testOutput = await captureStdout(async () => {
    await parseCommander(program, ["capability", "package", "test"]);
  });
  assert.match(testOutput, /package tests: passed/i);
});
