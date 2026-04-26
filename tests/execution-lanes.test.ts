import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import type { RunTurnOptions, RunTurnResult } from "../src/agent/types.js";
import { MessageBus } from "../src/team/messageBus.js";
import { reconcileActiveExecutions } from "../src/execution/reconcile.js";
import { reconcileTeamState } from "../src/team/reconcile.js";
import { TeamStore } from "../src/team/store.js";
import { TaskStore } from "../src/tasks/store.js";
import { initGitRepo, createTempWorkspace, createTestRuntimeConfig } from "./helpers.js";
import { closeExecution } from "../src/execution/closeout.js";
import { prepareExecutionTaskContext } from "../src/execution/taskBinding.js";
import { buildExecutionWorkerLaunch } from "../src/execution/launch.js";
import { runWithinAgentExecutionBoundary } from "../src/execution/agentBoundary.js";
import { ExecutionStore } from "../src/execution/store.js";
import { runExecutionWorker } from "../src/execution/worker.js";

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

  assert.equal(subagent.boundary.protocol, "deadmouse.execution-boundary.v1");
  assert.equal(subagent.boundary.returnTo, "lead");
  assert.equal(subagent.boundary.onBoundary, "return_to_lead_review");
  assert.equal(typeof subagent.boundary.maxRuntimeMs, "number");
  assert.equal(typeof subagent.boundary.maxIdleMs, "number");
  assert.equal(teammate.boundary.protocol, "deadmouse.execution-boundary.v1");
  assert.equal(background.boundary.maxRuntimeMs, background.timeoutMs);
  assert.equal(background.boundary.maxIdleMs, background.stallTimeoutMs);
  assert.equal(background.timeoutMs! < 999_999, true);
  assert.equal(background.stallTimeoutMs! > 1, true);
});

test("agent execution boundary is enforced by the machine instead of prompt text only", async () => {
  const result = await runWithinAgentExecutionBoundary({
    boundary: {
      protocol: "deadmouse.execution-boundary.v1",
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
      protocol: "deadmouse.execution-boundary.v1",
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


test("task-bound agent executions use the shared claim and worktree binding path", async (t) => {
  const root = await createTempWorkspace("execution-task-binding", t);
  await initGitRepo(root);
  const tasks = new TaskStore(root);
  const store = new ExecutionStore(root);

  const surveyTask = await tasks.create("survey task");
  const implementationTask = await tasks.create("implementation task", "", { assignee: "alpha" });

  const subagent = await store.create({
    lane: "agent",
    profile: "subagent",
    launch: "worker",
    requestedBy: "lead",
    actorName: "survey-1",
    cwd: root,
    prompt: "Survey the task.",
    taskId: surveyTask.id,
    worktreePolicy: "task",
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
    taskId: implementationTask.id,
    worktreePolicy: "task",
  });

  const preparedSubagent = await prepareExecutionTaskContext({
    rootDir: root,
    execution: subagent,
  });
  const preparedTeammate = await prepareExecutionTaskContext({
    rootDir: root,
    execution: teammate,
  });

  const reloadedSurvey = await tasks.load(surveyTask.id);
  const reloadedImplementation = await tasks.load(implementationTask.id);

  assert.ok(preparedSubagent.worktree);
  assert.ok(preparedTeammate.worktree);
  assert.equal(reloadedSurvey.status, "in_progress");
  assert.equal(reloadedImplementation.status, "in_progress");
  assert.equal(reloadedSurvey.worktree, preparedSubagent.worktree?.name);
  assert.equal(reloadedImplementation.worktree, preparedTeammate.worktree?.name);
});

test("all detached execution lanes hand off completion through one inbox contract", async (t) => {
  const root = await createTempWorkspace("execution-closeout", t);
  const store = new ExecutionStore(root);

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

  await store.start(teammate.id, { pid: 1111, sessionId: "session-alpha" });
  await store.start(background.id, { pid: 2222 });

  await closeExecution({
    rootDir: root,
    executionId: teammate.id,
    status: "completed",
    summary: "implemented",
    resultText: "Task finished.",
  });
  await closeExecution({
    rootDir: root,
    executionId: background.id,
    status: "completed",
    summary: "validation passed",
    output: "all green",
    exitCode: 0,
  });

  const inbox = await new MessageBus(root).peekInbox("lead");
  assert.equal(inbox.length, 2);
  assert.ok(inbox.every((message) => message.type === "execution_closeout"));
  assert.ok(inbox.every((message) => typeof message.executionId === "string" && message.executionId.length > 0));
  assert.ok(inbox.every((message) => message.executionStatus === "completed"));
});

test("reconcileTeamState closes stale teammate executions instead of waiting forever on dead workers", async (t) => {
  const root = await createTempWorkspace("execution-stale-teammate", t);
  const taskStore = new TaskStore(root);
  const teamStore = new TeamStore(root);
  const executionStore = new ExecutionStore(root);
  const deadPid = 999_999;

  const task = await taskStore.create("implementation task", "", { assignee: "alpha" });
  await taskStore.claim(task.id, "alpha");
  await teamStore.upsertMember("alpha", "implementer", "working", {
    pid: deadPid,
    sessionId: "session-alpha",
  });

  const execution = await executionStore.create({
    lane: "agent",
    profile: "teammate",
    launch: "worker",
    requestedBy: "lead",
    actorName: "alpha",
    actorRole: "implementer",
    taskId: task.id,
    cwd: root,
    prompt: "Implement the task.",
  });
  await executionStore.start(execution.id, {
    pid: deadPid,
    sessionId: "session-alpha",
  });

  const result = await reconcileTeamState(root);
  const reloadedMember = await teamStore.findMember("alpha");
  const reloadedTask = await taskStore.load(task.id);
  const reloadedExecution = await executionStore.load(execution.id);

  assert.equal(result.staleMembers.length, 1);
  assert.equal(result.closedExecutions.length, 1);
  assert.equal(result.releasedTasks.length, 1);
  assert.equal(reloadedMember?.status, "shutdown");
  assert.equal(reloadedTask.owner, "");
  assert.equal(reloadedTask.status, "pending");
  assert.equal(reloadedExecution.status, "failed");
  assert.match(String(reloadedExecution.output ?? ""), /exited unexpectedly/i);
});

test("reconcileActiveExecutions fails queued worker executions that never reached a live pid", async (t) => {
  const root = await createTempWorkspace("execution-stale-queued-worker", t);
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

  const result = await reconcileActiveExecutions(root);
  const reloaded = await store.load(execution.id);

  assert.equal(result.reconciledExecutions.length, 1);
  assert.equal(reloaded.status, "failed");
  assert.match(String(reloaded.output ?? ""), /never reached a live worker/i);
});

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

  const agentTurnModule = require("../src/agent/turn/managed.js") as {
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
