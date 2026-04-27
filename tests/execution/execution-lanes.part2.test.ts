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
