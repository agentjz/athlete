import assert from "node:assert/strict";
import test from "node:test";

import { MemorySessionStore } from "../src/agent/session.js";
import { dispatchOrchestratorAction } from "../src/orchestrator/dispatch.js";
import { buildOrchestratorObjective } from "../src/orchestrator/metadata.js";
import { ensureTaskPlan } from "../src/orchestrator/taskPlanning.js";
import { loadOrchestratorProgress } from "../src/orchestrator/progress.js";
import { routeOrchestratorAction } from "../src/orchestrator/route.js";
import { BackgroundJobStore } from "../src/execution/background.js";
import { TaskStore } from "../src/tasks/store.js";
import { TeamStore } from "../src/team/store.js";
import { createTempWorkspace, createTestRuntimeConfig } from "./helpers.js";

test("dispatchOrchestratorAction completes delegated subagent tasks and records the handoff", async (t) => {
  const root = await createTempWorkspace("orchestrator-subagent", t);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);
  const analysis = {
    objective: {
      key: "objective-subagent",
      text: "Survey the runtime and find the safest integration point.",
    },
    complexity: "complex" as const,
    needsInvestigation: true,
    prefersParallel: false,
    wantsBackground: false,
    wantsSubagent: true,
    wantsTeammate: false,
    backgroundCommand: undefined,
  };
  const plan = await ensureTaskPlan({
    rootDir: root,
    cwd: root,
    analysis,
    existingTasks: [],
  });
  const surveyTask = plan.readyTasks.find((task) => task.meta.kind === "survey");
  assert.ok(surveyTask);

  const outcome = await dispatchOrchestratorAction({
    rootDir: root,
    cwd: root,
    config: createTestRuntimeConfig(root),
    session,
    sessionStore,
    analysis,
    decision: {
      action: "delegate_subagent",
      reason: "survey first",
      task: surveyTask!,
      subagentType: "explore",
    },
    deps: {
      runSubagentTask: async () => ({
        executionId: "exec-subagent-1",
        content: "Found the narrow integration point.",
      }),
    },
  });

  const task = await new TaskStore(root).load(surveyTask!.record.id);
  assert.equal(task.status, "completed");
  assert.equal(outcome.session.messages.some((message) => String(message.content ?? "").includes("subagent")), true);
});

test("dispatchOrchestratorAction reserves teammate work on the task board and starts a worker when needed", async (t) => {
  const root = await createTempWorkspace("orchestrator-teammate", t);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);
  const analysis = {
    objective: {
      key: "objective-teammate",
      text: "Implement the feature in parallel with a teammate.",
    },
    complexity: "complex" as const,
    needsInvestigation: false,
    prefersParallel: true,
    wantsBackground: false,
    wantsSubagent: false,
    wantsTeammate: true,
    backgroundCommand: undefined,
  };
  const plan = await ensureTaskPlan({
    rootDir: root,
    cwd: root,
    analysis,
    existingTasks: [],
  });
  const progress = await loadOrchestratorProgress({
    rootDir: root,
    cwd: root,
    objective: analysis.objective,
  });
  const implementationTask = progress.readyTasks.find((task) => task.meta.kind === "implementation");
  assert.ok(implementationTask);

  await dispatchOrchestratorAction({
    rootDir: root,
    cwd: root,
    config: createTestRuntimeConfig(root),
    session,
    sessionStore,
    analysis,
    decision: {
      action: "delegate_teammate",
      reason: "parallel implementation",
      task: implementationTask!,
      teammate: {
        name: "worker-1",
        role: "implementer",
      },
    },
    deps: {
      spawnExecutionWorker: () => 4321,
    },
  });

  const task = await new TaskStore(root).load(implementationTask!.record.id);
  const member = await new TeamStore(root).findMember("worker-1");
  assert.equal(task.assignee, "worker-1");
  assert.equal(member?.status, "working");
  assert.equal(member?.pid, 4321);
});

test("dispatchOrchestratorAction creates real background jobs through BackgroundJobStore", async (t) => {
  const root = await createTempWorkspace("orchestrator-background", t);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);
  const analysis = {
    objective: {
      key: "objective-background",
      text: "Run the validation suite in the background.",
    },
    complexity: "moderate" as const,
    needsInvestigation: false,
    prefersParallel: false,
    wantsBackground: true,
    wantsSubagent: false,
    wantsTeammate: false,
    backgroundCommand: "node -e setTimeout(() => console.log(123), 500)",
  };
  const plan = await ensureTaskPlan({
    rootDir: root,
    cwd: root,
    analysis,
    existingTasks: [],
  });
  const backgroundTask = plan.readyTasks.find((task) => task.meta.kind === "validation") ?? plan.readyTasks[0];
  assert.ok(backgroundTask);

  await dispatchOrchestratorAction({
    rootDir: root,
    cwd: root,
    config: createTestRuntimeConfig(root),
    session,
    sessionStore,
    analysis,
    decision: {
      action: "run_in_background",
      reason: "long-running validation",
      task: backgroundTask!,
      backgroundCommand: "node -e setTimeout(() => console.log(123), 500)",
    },
    deps: {
      spawnExecutionWorker: () => 9876,
    },
  });

  const jobs = await new BackgroundJobStore(root).list();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]?.pid, 9876);
  assert.equal(jobs[0]?.command, "node -e \"setTimeout(() => console.log(123), 500)\"");
});

test("background routing does not silently launch duplicate jobs after reload", async (t) => {
  const root = await createTempWorkspace("orchestrator-background-repeat", t);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);
  const analysis = {
    objective: buildOrchestratorObjective("Run the validation suite in the background: `npm test -- --watch=false`"),
    complexity: "moderate" as const,
    needsInvestigation: false,
    prefersParallel: false,
    wantsBackground: true,
    wantsSubagent: false,
    wantsTeammate: false,
    backgroundCommand: "npm test -- --watch=false",
  };
  await ensureTaskPlan({
    rootDir: root,
    cwd: root,
    analysis,
    existingTasks: [],
  });
  const taskStore = new TaskStore(root);
  const implementation = (await taskStore.list()).find((task) => task.subject.startsWith("Implement:"));
  assert.ok(implementation);
  await taskStore.update(implementation!.id, {
    status: "completed",
  });
  let spawnCount = 0;

  const firstProgress = await loadOrchestratorProgress({
    rootDir: root,
    cwd: root,
    objective: analysis.objective,
  });
  const validationTask = firstProgress.relevantTasks.find((task) => task.record.subject.startsWith("Validate:"));
  assert.ok(validationTask);
  await dispatchOrchestratorAction({
    rootDir: root,
    cwd: root,
    config: createTestRuntimeConfig(root),
    session,
    sessionStore,
    analysis,
    decision: {
      action: "run_in_background",
      reason: "background validation",
      task: validationTask!,
      backgroundCommand: analysis.backgroundCommand,
    },
    deps: {
      spawnExecutionWorker: () => {
        spawnCount += 1;
        return 9000 + spawnCount;
      },
    },
  });

  const secondProgress = await loadOrchestratorProgress({
    rootDir: root,
    cwd: root,
    objective: analysis.objective,
  });
  const secondDecision = routeOrchestratorAction({
    analysis,
    progress: secondProgress,
    plan: {
      objective: analysis.objective,
      createdTaskIds: [],
      tasks: secondProgress.relevantTasks,
      readyTasks: secondProgress.readyTasks,
    },
  });

  const jobs = await new BackgroundJobStore(root).list();
  assert.equal(spawnCount, 1);
  assert.equal(jobs.length, 1);
  assert.notEqual(secondDecision.action, "run_in_background");
});
