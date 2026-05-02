import assert from "node:assert/strict";
import test from "node:test";

import { getDreamingCapabilityPackage } from "../../src/capabilities/dreaming/capabilityAdapter.js";
import { createRuntimeCapabilityRegistry } from "../../src/capabilities/registry.js";
import { dreamingStartTool } from "../../src/capabilities/tools/packages/dreaming/dreamingStartTool.js";
import { createToolRegistry } from "../../src/capabilities/tools/index.js";
import { ExecutionStore } from "../../src/execution/store.js";
import type { ToolContext } from "../../src/capabilities/tools/core/types.js";
import { createTempWorkspace, makeToolContext } from "../helpers.js";

test("Dreaming enters the unified capability registry as a Lead-selected external agent", () => {
  const registry = createRuntimeCapabilityRegistry();
  const pkg = registry.resolve("external_agent.dreaming");

  assert.equal(pkg.packageId, "external_agent.dreaming");
  assert.equal(pkg.profile.name, "Dreaming");
  assert.equal(pkg.runner.type, "dreaming");
  assert.equal(pkg.port.runner.type, "dreaming");
  assert.equal(pkg.port.permissionBoundary.world, "Mirror World");
  assert.match(pkg.port.permissionBoundary.autonomy, /internal exploration loop/i);
  assert.equal(pkg.port.foregroundOutput.mode, "foreground_stream");
  assert.equal(pkg.port.closeout.mergeProposal, "required");
  assert.equal(pkg.runner.leadWaitPolicy.lead, "while_execution_active");
  assert.equal(pkg.machinePermissions.autoSelect, false);
  assert.equal(pkg.machinePermissions.autoDispatch, false);
});

test("Dreaming package advertises mirror-world execution without real-world mutation", () => {
  const pkg = getDreamingCapabilityPackage();

  assert.equal(pkg.profile.tools.includes("dreaming_start"), true);
  assert.match(pkg.leadSummary.availability, /Mirror World/i);
  assert.match(pkg.leadSummary.availability, /unchanged/i);
  assert.equal(pkg.machinePermissions.autoDispatch, false);
});

test("dreaming_start creates Assignment-backed dreaming execution and foreground state", async (t) => {
  const root = await createTempWorkspace("dreaming-start", t);
  let dispatch: Record<string, unknown> | undefined;
  const result = await dreamingStartTool.execute(
    JSON.stringify({
      objective: "Improve architecture in Mirror World.",
      scope: "Mirror World only.",
      expected_output: "Merge proposal and evidence.",
      max_runtime_ms: 5_000,
      max_idle_ms: 2_000,
    }),
    makeToolContext(root, root, {
      callbacks: {
        onDispatch(event: Record<string, unknown>) {
          dispatch = event;
        },
      },
    }) as unknown as ToolContext,
  );

  const payload = JSON.parse(result.output) as {
    executionId: string;
    status: string;
    protocol: Record<string, string>;
  };
  const stored = await new ExecutionStore(root).load(payload.executionId);

  assert.equal(result.ok, true);
  assert.equal(payload.status, "launched");
  assert.equal(payload.protocol.mirrorWorld, "kitty.mirror-world");
  assert.equal(stored.profile, "dreaming");
  assert.equal(stored.launch, "worker");
  assert.equal(stored.status, "running");
  assert.equal(stored.assignmentSnapshot?.capabilityId, "external_agent.dreaming");
  assert.equal(stored.capabilityPackageSnapshot?.packageId, "external_agent.dreaming");
  assert.equal(stored.waitPolicy?.lead, "while_execution_active");
  assert.equal(result.metadata?.collaboration?.yieldLeadUntilCloseout, true);
  assert.equal(dispatch?.profile, "dreaming");
});

test("dreaming_start governance does not require verification metadata at dispatch time", async (t) => {
  const root = await createTempWorkspace("dreaming-start-governance", t);
  const registry = createToolRegistry({ onlyNames: ["dreaming_start"] });
  const result = await registry.execute(
    "dreaming_start",
    JSON.stringify({
      objective: "Start Dreaming only.",
      scope: "Dispatch path.",
      expected_output: "Execution id.",
    }),
    makeToolContext(root) as unknown as ToolContext,
  );

  assert.equal(result.ok, true);
  assert.equal(result.metadata?.protocol?.status, "completed");
});


test("dreaming_start is Lead-only", async (t) => {
  const root = await createTempWorkspace("dreaming-start-non-lead", t);

  await assert.rejects(
    () => dreamingStartTool.execute(
      JSON.stringify({
        objective: "Try to start Dreaming.",
        scope: "Test.",
        expected_output: "Blocked.",
      }),
      makeToolContext(root, root, {
        identity: {
          kind: "teammate",
          name: "worker",
        },
      }) as unknown as ToolContext,
    ),
    /Only the lead can start Dreaming/i,
  );
});
