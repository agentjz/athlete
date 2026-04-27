import assert from "node:assert/strict";
import test from "node:test";

import { createAssignmentContract, formatAssignmentContract } from "../../src/protocol/assignment.js";
import { createCapabilityProfile, formatCapabilityProfile } from "../../src/protocol/capability.js";
import { formatCloseoutInstruction, normalizeCloseoutText } from "../../src/protocol/closeout.js";
import { formatCapabilityRegistryForLead } from "../../src/protocol/registry.js";
import { snapshotExecutionWakeSignal, publishExecutionWakeSignal } from "../../src/protocol/wakeSignal.js";
import { taskTool } from "../../src/tools/tasks/taskTool.js";
import { spawnTeammateTool } from "../../src/tools/team/spawnTeammateTool.js";
import { createTempWorkspace } from "../helpers.js";

test("protocol platform keeps capability, assignment, and closeout as generic contracts", () => {
  const capability = createCapabilityProfile({
    kind: "workflow",
    id: "generic-workflow",
    name: "Generic workflow",
    description: "Reusable method selected by Lead.",
    bestFor: ["repeatable work"],
    notFor: ["automatic strategy"],
    extensionPoint: "test",
  });
  const assignment = createAssignmentContract({
    capabilityId: capability.id,
    objective: "Inspect the generic protocol boundary.",
    scope: "Protocol only.",
    expectedOutput: "CloseoutContract.",
    createdBy: "lead",
  });

  assert.match(formatCapabilityProfile(capability), /deadmouse\.capability\.v1|workflow:generic-workflow/);
  assert.match(formatAssignmentContract(assignment), /deadmouse\.assignment\.v1/);
  assert.match(formatCloseoutInstruction(), /deadmouse\.closeout\.v1/);
  assert.match(normalizeCloseoutText("raw result"), /status: blocked/);
});

test("capability registry explains availability without creating machine intent", () => {
  const registry = formatCapabilityRegistryForLead([
    {
      listCapabilityProfiles: () => [createCapabilityProfile({
        kind: "team",
        id: "teammate",
        name: "Teammate",
        description: "Lead-selected teammate.",
        extensionPoint: "test",
      })],
    },
  ]);

  assert.match(registry, /available options for Lead, not automatic machine decisions/);
  assert.match(registry, /AssignmentContract/);
  assert.match(registry, /CloseoutContract/);
});

test("delegation tools require AssignmentContract fields for dispatch", () => {
  const taskParameters = taskTool.definition.function.parameters as {
    required: string[];
    properties: Record<string, unknown>;
  };
  const teammateParameters = spawnTeammateTool.definition.function.parameters as {
    required: string[];
    properties: Record<string, unknown>;
  };

  assert.deepEqual(taskParameters.required, [
    "description",
    "objective",
    "scope",
    "expected_output",
    "agent_type",
  ]);
  assert.deepEqual(teammateParameters.required, [
    "name",
    "role",
    "objective",
    "scope",
    "expected_output",
  ]);
  assert.equal("prompt" in taskParameters.properties, false);
  assert.equal("prompt" in teammateParameters.properties, false);
});

test("wake signal is a single overwritten doorbell, not an accumulating truth source", async (t) => {
  const root = await createTempWorkspace("protocol-wake-signal", t);
  await publishExecutionWakeSignal(root, { executionId: "exec-1", reason: "completed" });
  const first = await snapshotExecutionWakeSignal(root);
  await publishExecutionWakeSignal(root, { executionId: "exec-2", reason: "failed" });
  const second = await snapshotExecutionWakeSignal(root);

  assert.equal(first.signal?.executionId, "exec-1");
  assert.equal(second.signal?.executionId, "exec-2");
  assert.equal(second.mtimeMs >= first.mtimeMs, true);
});
