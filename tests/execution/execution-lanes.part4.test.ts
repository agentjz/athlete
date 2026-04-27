import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import type { RunTurnOptions, RunTurnResult } from "../../src/agent/types.js";
import { MessageBus } from "../../src/team/messageBus.js";
import { reconcileActiveExecutions } from "../../src/execution/reconcile.js";
import { reconcileTeamState } from "../../src/team/reconcile.js";
import { TeamStore } from "../../src/team/store.js";
import { TaskStore } from "../../src/tasks/store.js";
import { initGitRepo, createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";
import { closeExecution } from "../../src/execution/closeout.js";
import { prepareExecutionTaskContext } from "../../src/execution/taskBinding.js";
import { buildExecutionWorkerLaunch } from "../../src/execution/launch.js";
import { runWithinAgentExecutionBoundary } from "../../src/execution/agentBoundary.js";
import { ExecutionStore } from "../../src/execution/store.js";
import { runExecutionWorker } from "../../src/execution/worker.js";

test("execution lifecycle rejects status rewrites through save bypasses", async (t) => {
  const root = await createTempWorkspace("execution-no-save-bypass", t);
  const store = new ExecutionStore(root);
  const execution = await store.create({
    lane: "agent",
    profile: "subagent",
    launch: "worker",
    requestedBy: "lead",
    actorName: "survey-1",
    cwd: root,
    prompt: "Survey the codebase.",
  });

  await assert.rejects(
    () => store.save({
      ...execution,
      status: "completed",
      summary: "bypassed closeout",
      finishedAt: "2026-04-12T00:00:00.000Z",
    }),
    /go through start\(\.\.\.\) or close\(\.\.\.\)/i,
  );

  const reloaded = await store.load(execution.id);
  assert.equal(reloaded.status, "queued");
  assert.equal(reloaded.summary, undefined);
  assert.equal(reloaded.finishedAt, undefined);
});

test("execution ledger fails closed on invalid status values instead of defaulting them", async (t) => {
  const root = await createTempWorkspace("execution-invalid-status", t);
  const store = new ExecutionStore(root);
  const execution = await store.create({
    lane: "agent",
    profile: "subagent",
    launch: "worker",
    requestedBy: "lead",
    actorName: "survey-1",
    cwd: root,
    prompt: "Survey the codebase.",
  });

  await assert.rejects(
    () => store.save({
      ...execution,
      status: "runninggg" as unknown as typeof execution.status,
    }),
    /invalid execution status/i,
  );
});
