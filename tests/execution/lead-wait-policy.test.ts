import assert from "node:assert/strict";
import test from "node:test";

import { hasActiveLeadWaitExecutions } from "../../src/execution/leadWait.js";
import { ExecutionStore } from "../../src/execution/store.js";
import type { ExecutionRecord } from "../../src/execution/types.js";
import { createTempWorkspace } from "../helpers.js";

test("lead wait is driven by execution wait policy snapshots, not profile names", async (t) => {
  const root = await createTempWorkspace("lead-wait-policy-profile-agnostic", t);
  const store = new ExecutionStore(root);

  const workflow = await store.create({
    lane: "agent",
    profile: "workflow",
    launch: "worker",
    requestedBy: "lead",
    actorName: "generic-workflow",
    cwd: root,
    worktreePolicy: "none",
    waitPolicy: {
      lead: "while_execution_active",
      wake: "required",
      scope: "global",
      terminalStatuses: ["completed", "failed", "aborted", "paused"],
    },
  });
  await store.start(workflow.id, { pid: process.pid });

  assert.equal(await hasActiveLeadWaitExecutions(root), true);
});

test("executions with non-blocking wait policy do not suspend Lead even when running", async (t) => {
  const root = await createTempWorkspace("lead-wait-policy-none", t);
  const store = new ExecutionStore(root);

  const execution = await store.create({
    lane: "agent",
    profile: "workflow",
    launch: "worker",
    requestedBy: "lead",
    actorName: "non-blocking-workflow",
    cwd: root,
    worktreePolicy: "none",
    waitPolicy: {
      lead: "none",
      wake: "optional",
      scope: "global",
      terminalStatuses: ["completed", "failed", "aborted", "paused"],
    },
  });
  await store.start(execution.id, { pid: process.pid });

  assert.equal(await hasActiveLeadWaitExecutions(root), false);
});

test("execution wait policy survives ledger round trips as an audit snapshot", async (t) => {
  const root = await createTempWorkspace("lead-wait-policy-round-trip", t);
  const store = new ExecutionStore(root);

  const execution = await store.create({
    lane: "command",
    profile: "background",
    launch: "worker",
    requestedBy: "lead",
    actorName: "background",
    cwd: root,
    command: "npm test",
    waitPolicy: {
      lead: "while_execution_active",
      wake: "required",
      scope: "objective",
      terminalStatuses: ["completed", "failed", "aborted", "paused"],
    },
  });
  const loaded = await store.load(execution.id);

  assert.deepEqual(loaded.waitPolicy, execution.waitPolicy);
});

test("legacy execution records default to blocking Lead only when created by Lead and wake-backed", () => {
  const legacy = {
    id: "legacy",
    lane: "agent",
    profile: "workflow",
    launch: "worker",
    requestedBy: "lead",
    actorName: "workflow",
    cwd: process.cwd(),
    status: "running",
    worktreePolicy: "none",
    boundary: {
      protocol: "deadmouse.execution-boundary",
      returnTo: "lead",
      onBoundary: "return_to_lead_review",
      maxRuntimeMs: 900_000,
      maxIdleMs: 180_000,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as ExecutionRecord;

  assert.equal(legacy.waitPolicy, undefined);
});
