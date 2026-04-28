import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import type { RunTurnOptions, RunTurnResult } from "../../src/agent/types.js";
import { MessageBus } from "../../src/capabilities/team/messageBus.js";
import { reconcileActiveExecutions } from "../../src/execution/reconcile.js";
import { reconcileTeamState } from "../../src/capabilities/team/reconcile.js";
import { TeamStore } from "../../src/capabilities/team/store.js";
import { TaskStore } from "../../src/tasks/store.js";
import { initGitRepo, createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";
import { closeExecution } from "../../src/execution/closeout.js";
import { prepareExecutionTaskContext } from "../../src/execution/taskBinding.js";
import { buildExecutionWorkerLaunch } from "../../src/execution/launch.js";
import { runWithinAgentExecutionBoundary } from "../../src/execution/agentBoundary.js";
import { ExecutionStore } from "../../src/execution/store.js";
import { runExecutionWorker } from "../../src/execution/worker.js";

test("execution lanes share one worker launch protocol instead of lane-specific CLI entries", async (t) => {
  const root = await createTempWorkspace("execution-worker-launch", t);
  const launch = buildExecutionWorkerLaunch({
    rootDir: root,
    config: createTestRuntimeConfig(root),
    executionId: "exec-123",
  });

  assert.deepEqual(
    launch.args.slice(-4),
    ["__worker__", "run", "--execution-id", "exec-123"],
  );
  assert.equal(launch.args.includes("--model"), false);
  assert.equal(launch.env.DEADMOUSE_SUBAGENT_MODEL, "deepseek-v4-flash");
  assert.equal(launch.env.DEADMOUSE_SUBAGENT_THINKING, "enabled");
  assert.equal(launch.env.DEADMOUSE_TEAMMATE_MODEL, "deepseek-v4-flash");
  assert.equal(launch.env.DEADMOUSE_TEAMMATE_THINKING, "enabled");
});

test("execution lanes share one formal lifecycle across agent and command work", async (t) => {
  const root = await createTempWorkspace("execution-lifecycle", t);
  const store = new ExecutionStore(root);

  const subagent = await store.create({
    lane: "agent",
    profile: "subagent",
    launch: "worker",
    requestedBy: "lead",
    actorName: "survey-1",
    cwd: root,
    prompt: "Survey the codebase.",
  });
  const teammate = await store.create({
    lane: "agent",
    profile: "teammate",
    launch: "worker",
    requestedBy: "lead",
    actorName: "alpha",
    actorRole: "implementer",
    cwd: root,
    prompt: "Implement the task.",
  });
  const background = await store.create({
    lane: "command",
    profile: "background",
    launch: "worker",
    requestedBy: "lead",
    actorName: "bg-exec",
    cwd: root,
    command: "npm test -- --watch=false",
  });

  await store.start(subagent.id, { sessionId: "session-subagent" });
  await store.start(teammate.id, { pid: 4242, sessionId: "session-alpha" });
  await store.start(background.id, { pid: 5252 });

  await closeExecution({
    rootDir: root,
    executionId: subagent.id,
    status: "completed",
    summary: "survey complete",
    resultText: "Found the integration point.",
    notifyRequester: false,
  });
  await closeExecution({
    rootDir: root,
    executionId: teammate.id,
    status: "paused",
    summary: "waiting for review",
    pauseReason: "blocked by merge review",
    notifyRequester: false,
  });
  await closeExecution({
    rootDir: root,
    executionId: background.id,
    status: "failed",
    summary: "tests failed",
    output: "1 failing test",
    exitCode: 1,
    notifyRequester: false,
  });

  const records = await store.list();
  const byId = new Map(records.map((record) => [record.id, record]));

  assert.equal(byId.get(subagent.id)?.status, "completed");
  assert.equal(byId.get(teammate.id)?.status, "paused");
  assert.equal(byId.get(background.id)?.status, "failed");
  assert.equal(byId.get(subagent.id)?.sessionId, "session-subagent");
  assert.equal(byId.get(teammate.id)?.sessionId, "session-alpha");
  assert.equal(byId.get(background.id)?.pid, 5252);
});

test("execution creation applies one boundary protocol across all execution lanes", async (t) => {
  const root = await createTempWorkspace("execution-boundary-protocol", t);
  const store = new ExecutionStore(root);

  const subagent = await store.create({
    lane: "agent",
    profile: "subagent",
    launch: "worker",
    requestedBy: "lead",
    actorName: "survey-1",
    cwd: root,
    prompt: "Survey the codebase.",
  });
  const teammate = await store.create({
    lane: "agent",
    profile: "teammate",
    launch: "worker",
    requestedBy: "lead",
    actorName: "alpha",
    actorRole: "implementer",
    cwd: root,
    prompt: "Implement the task.",
  });
  const background = await store.create({
    lane: "command",
    profile: "background",
    launch: "worker",
    requestedBy: "lead",
    actorName: "bg-exec",
    cwd: root,
    command: "npm test -- --watch=false",
    timeoutMs: 999_999,
    stallTimeoutMs: 1,
  });

  assert.equal(subagent.boundary.protocol, "deadmouse.execution-boundary");
  assert.equal(subagent.boundary.returnTo, "lead");
  assert.equal(subagent.boundary.onBoundary, "return_to_lead_review");
  assert.equal(typeof subagent.boundary.maxRuntimeMs, "number");
  assert.equal(typeof subagent.boundary.maxIdleMs, "number");
  assert.equal(teammate.boundary.protocol, "deadmouse.execution-boundary");
  assert.equal(background.boundary.maxRuntimeMs, background.timeoutMs);
  assert.equal(background.boundary.maxIdleMs, background.stallTimeoutMs);
  assert.equal(background.timeoutMs! < 999_999, true);
  assert.equal(background.stallTimeoutMs! > 1, true);
});

test("agent execution boundary is enforced by the machine instead of prompt text only", async () => {
  const result = await runWithinAgentExecutionBoundary({
    boundary: {
      protocol: "deadmouse.execution-boundary",
      returnTo: "lead",
      onBoundary: "return_to_lead_review",
      maxRuntimeMs: 10,
      maxIdleMs: 1_000,
    },
    run: async ({ abortSignal }) => {
      await new Promise<void>((resolve) => {
        abortSignal.addEventListener("abort", () => resolve(), { once: true });
      });
      return "runner observed abort";
    },
  });

  assert.equal(result.kind, "boundary");
  assert.equal(result.reason.code, "execution_boundary_runtime");
  assert.equal(result.reason.returnTo, "lead");
  assert.equal(result.reason.onBoundary, "return_to_lead_review");

  const idleResult = await runWithinAgentExecutionBoundary({
    boundary: {
      protocol: "deadmouse.execution-boundary",
      returnTo: "lead",
      onBoundary: "return_to_lead_review",
      maxRuntimeMs: 1_000,
      maxIdleMs: 10,
    },
    run: async ({ abortSignal }) => {
      await new Promise<void>((resolve) => {
        abortSignal.addEventListener("abort", () => resolve(), { once: true });
      });
      return "runner observed abort";
    },
  });

  assert.equal(idleResult.kind, "boundary");
  assert.equal(idleResult.reason.code, "execution_boundary_idle");
});
