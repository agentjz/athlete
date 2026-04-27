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

test("execution ledger rejects the removed inline launch mode", async (t) => {
  const root = await createTempWorkspace("execution-no-inline-launch", t);
  const store = new ExecutionStore(root);

  await assert.rejects(
    () => store.create({
      lane: "agent",
      profile: "subagent",
      launch: "inline" as unknown as "worker",
      requestedBy: "lead",
      actorName: "survey-1",
      cwd: root,
      prompt: "Survey the codebase.",
    }),
    /invalid execution launch mode/i,
  );
});

test("runExecutionWorker fails closed on corrupt persisted sessions instead of inventing a replacement session", async (t) => {
  const root = await createTempWorkspace("execution-corrupt-session", t);
  const config = createTestRuntimeConfig(root);
  const store = new ExecutionStore(root);
  const execution = await store.create({
    lane: "agent",
    profile: "teammate",
    launch: "worker",
    requestedBy: "lead",
    actorName: "alpha",
    actorRole: "implementer",
    cwd: root,
    prompt: "Implement the task.",
  });
  await store.save({
    ...execution,
    sessionId: "broken-session",
  });

  await fs.mkdir(config.paths.sessionsDir, { recursive: true });
  await fs.writeFile(path.join(config.paths.sessionsDir, "broken-session.json"), "{ not-valid-json", "utf8");

  const agentTurnModule = require("../../src/agent/turn/managed.js") as {
    runManagedAgentTurn: (options: RunTurnOptions) => Promise<RunTurnResult>;
  };
  const originalRunManagedAgentTurn = agentTurnModule.runManagedAgentTurn;
  agentTurnModule.runManagedAgentTurn = async (options) => ({
    session: await options.sessionStore.save({
      ...options.session,
      messages: [
        ...options.session.messages,
        {
          role: "assistant",
          content: "done",
          createdAt: new Date().toISOString(),
        },
      ],
    }),
    changedPaths: [],
    verificationAttempted: false,
    yielded: false,
    paused: false,
  });
  t.after(() => {
    agentTurnModule.runManagedAgentTurn = originalRunManagedAgentTurn;
  });

  await assert.rejects(
    () => runExecutionWorker({
      rootDir: root,
      config,
      executionId: execution.id,
    }),
    (error: unknown) => {
      assert.equal((error as { code?: unknown }).code, "SESSION_CORRUPT");
      assert.match(String((error as { message?: unknown }).message ?? error), /invalid JSON/i);
      return true;
    },
  );

  const reloaded = await store.load(execution.id);
  assert.equal(reloaded.status, "queued");
  assert.equal(reloaded.sessionId, "broken-session");
  assert.deepEqual(
    (await fs.readdir(config.paths.sessionsDir)).sort(),
    ["broken-session.json"],
  );
});

test("execution lifecycle rejects restarting a completed execution", async (t) => {
  const root = await createTempWorkspace("execution-no-restart-after-complete", t);
  const store = new ExecutionStore(root);
  const execution = await store.create({
    lane: "agent",
    profile: "teammate",
    launch: "worker",
    requestedBy: "lead",
    actorName: "alpha",
    actorRole: "implementer",
    cwd: root,
    prompt: "Implement the task.",
  });

  await store.start(execution.id, {
    pid: 1234,
    sessionId: "session-alpha",
  });
  await closeExecution({
    rootDir: root,
    executionId: execution.id,
    status: "completed",
    summary: "implemented",
    resultText: "Task finished.",
    notifyRequester: false,
  });

  await assert.rejects(
    () => store.start(execution.id, {
      pid: 5678,
    }),
    /completed/i,
  );
});

test("execution lifecycle rejects closeout before an execution has formally started", async (t) => {
  const root = await createTempWorkspace("execution-no-close-from-queued", t);
  const store = new ExecutionStore(root);
  const execution = await store.create({
    lane: "command",
    profile: "background",
    launch: "worker",
    requestedBy: "lead",
    actorName: "background",
    cwd: root,
    command: "npm test -- --watch=false",
  });

  await assert.rejects(
    () => store.close(execution.id, {
      status: "completed",
      summary: "should not close from queued",
    }),
    /queued/i,
  );

  const reloaded = await store.load(execution.id);
  assert.equal(reloaded.status, "queued");
  assert.equal(reloaded.finishedAt, undefined);
});
