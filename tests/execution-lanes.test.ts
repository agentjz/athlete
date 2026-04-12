import assert from "node:assert/strict";
import test from "node:test";

import { MessageBus } from "../src/team/messageBus.js";
import { TaskStore } from "../src/tasks/store.js";
import { initGitRepo, createTempWorkspace, createTestRuntimeConfig } from "./helpers.js";
import { closeExecution } from "../src/execution/closeout.js";
import { prepareExecutionTaskContext } from "../src/execution/taskBinding.js";
import { buildExecutionWorkerLaunch } from "../src/execution/launch.js";
import { ExecutionStore } from "../src/execution/store.js";

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
});

test("execution lanes share one formal lifecycle across agent and command work", async (t) => {
  const root = await createTempWorkspace("execution-lifecycle", t);
  const store = new ExecutionStore(root);

  const subagent = await store.create({
    lane: "agent",
    profile: "subagent",
    launch: "inline",
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
    launch: "inline",
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
