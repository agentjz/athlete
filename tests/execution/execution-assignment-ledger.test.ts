import assert from "node:assert/strict";
import test from "node:test";

import { launchSubagentWorkerExecution } from "../../src/capabilities/subagent/launch.js";
import { spawnTeammateTool } from "../../src/capabilities/tools/packages/team/spawnTeammateTool.js";
import { BackgroundJobStore } from "../../src/execution/background.js";
import { ExecutionStore } from "../../src/execution/store.js";
import type { ToolContext } from "../../src/capabilities/tools/core/types.js";
import { createTempWorkspace, createTestRuntimeConfig, makeToolContext } from "../helpers.js";

test("subagent execution creation snapshots assignment, capability, and execution policy", async (t) => {
  const root = await createTempWorkspace("execution-assignment-subagent", t);
  const { execution } = await launchSubagentWorkerExecution({
    rootDir: root,
    cwd: root,
    config: createTestRuntimeConfig(root),
    description: "inspect protocol ledger",
    objective: "Check the execution assignment ledger path.",
    scope: "Subagent execution creation only.",
    expectedOutput: "CloseoutContract with facts.",
    agentType: "explore",
  }, {
    spawnExecutionWorker: () => process.pid,
  });
  const stored = await new ExecutionStore(root).load(execution.id);

  assert.equal(stored.assignmentSnapshot?.protocol, "kitty.assignment");
  assert.equal(stored.assignmentSnapshot?.capabilityId, "subagent.explore");
  assert.equal(stored.capabilityId, "subagent.explore");
  assert.equal(stored.capabilityKind, "subagent");
  assert.equal(stored.capabilityPackageSnapshot?.protocol, "kitty.capability-package");
  assert.equal(stored.executionPolicy?.protocol, "kitty.execution-policy");
  assert.deepEqual(stored.waitPolicy, stored.executionPolicy?.leadWaitPolicy);
});

test("teammate execution creation uses the same protocol ledger snapshots", async (t) => {
  const root = await createTempWorkspace("execution-assignment-teammate", t);
  const result = await spawnTeammateTool.execute(
    JSON.stringify({
      name: "alpha",
      role: "reviewer",
      objective: "Review protocol ledger creation.",
      scope: "Teammate creation only.",
      expected_output: "CloseoutContract with ledger facts.",
    }),
    makeToolContext(root) as unknown as ToolContext,
  );
  const payload = JSON.parse(result.output) as { executionId: string };
  const stored = await new ExecutionStore(root).load(payload.executionId);

  assert.equal(stored.assignmentSnapshot?.capabilityId, "team.teammate");
  assert.equal(stored.capabilityId, "team.teammate");
  assert.equal(stored.capabilityKind, "team");
  assert.equal(stored.executionPolicy?.type, "worker");
  assert.deepEqual(stored.waitPolicy, stored.executionPolicy?.leadWaitPolicy);
});

test("background execution creation uses the same protocol ledger snapshots", async (t) => {
  const root = await createTempWorkspace("execution-assignment-background", t);
  const job = await new BackgroundJobStore(root).create({
    command: "npm.cmd test",
    cwd: root,
    requestedBy: "lead",
    timeoutMs: 120_000,
    stallTimeoutMs: 30_000,
  });
  const stored = await new ExecutionStore(root).load(job.id);

  assert.equal(stored.assignmentSnapshot?.capabilityId, "background.command");
  assert.equal(stored.capabilityId, "background.command");
  assert.equal(stored.capabilityKind, "background");
  assert.equal(stored.executionPolicy?.type, "background");
  assert.deepEqual(stored.waitPolicy, stored.executionPolicy?.leadWaitPolicy);
});
