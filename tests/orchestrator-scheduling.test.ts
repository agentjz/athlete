import assert from "node:assert/strict";
import test from "node:test";

import { BackgroundJobStore } from "../src/execution/background.js";
import { readOrchestratorMetadata } from "../src/orchestrator/metadata.js";
import { loadOrchestratorProgress } from "../src/orchestrator/progress.js";
import { routeOrchestratorAction } from "../src/orchestrator/route.js";
import { ensureTaskPlan } from "../src/orchestrator/taskPlanning.js";
import { TaskStore } from "../src/tasks/store.js";
import { createTempWorkspace } from "./helpers.js";

function createComplexAnalysis() {
  return {
    objective: {
      key: "objective-scheduling",
      text: "Survey the change, implement in parallel, run long validation, then merge the child results.",
    },
    complexity: "complex" as const,
    needsInvestigation: true,
    prefersParallel: true,
    wantsBackground: true,
    wantsSubagent: true,
    wantsTeammate: true,
    backgroundCommand: "npm test -- --watch=false",
  };
}

test("TaskStore keeps completed dependency edges so the scheduler can still recover the task graph", async (t) => {
  const root = await createTempWorkspace("schedule-graph-history", t);
  const store = new TaskStore(root);

  const child = await store.create("survey");
  const parent = await store.create("merge");
  await store.update(parent.id, {
    addBlockedBy: [child.id],
  });

  await store.update(child.id, {
    status: "completed",
  });

  const completedChild = await store.load(child.id);
  const unblockedParent = await store.load(parent.id);

  assert.deepEqual(unblockedParent.blockedBy, []);
  assert.deepEqual(completedChild.blocks, [parent.id]);
});

test("ensureTaskPlan writes an advisory graph without preselecting lanes or merge", async (t) => {
  const root = await createTempWorkspace("schedule-plan", t);
  const analysis = createComplexAnalysis();

  await ensureTaskPlan({
    rootDir: root,
    cwd: root,
    analysis,
    existingTasks: [],
  });

  const tasks = await new TaskStore(root).list();
  const survey = tasks.find((task) => task.subject.startsWith("Survey:"));
  const implementation = tasks.find((task) => task.subject.startsWith("Implement:"));
  const validation = tasks.find((task) => task.subject.startsWith("Validate:"));
  const merge = tasks.find((task) => task.subject.startsWith("Merge:"));

  assert.ok(survey);
  assert.ok(implementation);
  assert.ok(validation);
  assert.equal(merge, undefined);

  const surveyMeta = readOrchestratorMetadata(survey!.description) as Record<string, unknown> | null;
  const implementationMeta = readOrchestratorMetadata(implementation!.description) as Record<string, unknown> | null;
  const validationMeta = readOrchestratorMetadata(validation!.description) as Record<string, unknown> | null;
  assert.equal(surveyMeta?.executor, "lead");
  assert.equal(implementationMeta?.executor, "lead");
  assert.equal(validationMeta?.executor, "lead");

  assert.deepEqual(implementation?.blockedBy, [survey!.id]);
  assert.deepEqual(validation?.blockedBy, [implementation!.id]);
});

test("background child completion syncs validation without precreating merge", async (t) => {
  const root = await createTempWorkspace("schedule-background-merge", t);
  const analysis = createComplexAnalysis();

  await ensureTaskPlan({
    rootDir: root,
    cwd: root,
    analysis,
    existingTasks: [],
  });

  const taskStore = new TaskStore(root);
  const survey = (await taskStore.list()).find((task) => task.subject.startsWith("Survey:"));
  const implementation = (await taskStore.list()).find((task) => task.subject.startsWith("Implement:"));
  assert.ok(survey);
  assert.ok(implementation);
  await taskStore.update(survey!.id, {
    status: "completed",
  });
  await taskStore.update(implementation!.id, {
    status: "completed",
  });

  const progressBeforeDispatch = await loadOrchestratorProgress({
    rootDir: root,
    cwd: root,
    objective: analysis.objective,
  });
  const validationTask = progressBeforeDispatch.relevantTasks.find((task) => task.record.subject.startsWith("Validate:"));
  assert.ok(validationTask);

  const backgroundStore = new BackgroundJobStore(root);
  const job = await backgroundStore.create({
    command: analysis.backgroundCommand!,
    cwd: root,
    requestedBy: "lead",
    timeoutMs: 30_000,
  });
  await taskStore.save({
    ...(await taskStore.load(validationTask!.record.id)),
    description: writeMetadataPatch(validationTask!.record.description, {
      backgroundCommand: analysis.backgroundCommand!,
      jobId: job.id,
    }),
  });
  await backgroundStore.setPid(job.id, 3001);
  await backgroundStore.complete(job.id, {
    status: "completed",
    exitCode: 0,
    output: "ok",
  });

  const progressAfterCompletion = await loadOrchestratorProgress({
    rootDir: root,
    cwd: root,
    objective: analysis.objective,
  });
  const reloadedValidation = progressAfterCompletion.relevantTasks.find((task) => task.record.id === validationTask!.record.id);
  const mergeTask = progressAfterCompletion.relevantTasks.find((task) => task.record.subject.startsWith("Merge:"));

  assert.ok(reloadedValidation);
  assert.equal(reloadedValidation?.record.status, "completed");
  assert.equal(mergeTask, undefined);
  assert.equal(progressAfterCompletion.readyTasks.some((task) => task.record.id === reloadedValidation!.record.id), false);
});

test("routing after reload does not wait on completed background validation", async (t) => {
  const root = await createTempWorkspace("schedule-reload-merge", t);
  const analysis = createComplexAnalysis();

  await ensureTaskPlan({
    rootDir: root,
    cwd: root,
    analysis,
    existingTasks: [],
  });

  const taskStore = new TaskStore(root);
  const survey = (await taskStore.list()).find((task) => task.subject.startsWith("Survey:"));
  const implementation = (await taskStore.list()).find((task) => task.subject.startsWith("Implement:"));
  assert.ok(survey);
  assert.ok(implementation);
  await taskStore.update(survey!.id, {
    status: "completed",
  });
  await taskStore.update(implementation!.id, {
    status: "completed",
  });

  const progress = await loadOrchestratorProgress({
    rootDir: root,
    cwd: root,
    objective: analysis.objective,
  });
  const validationTask = progress.relevantTasks.find((task) => task.record.subject.startsWith("Validate:"));
  assert.ok(validationTask);

  const backgroundStore = new BackgroundJobStore(root);
  const job = await backgroundStore.create({
    command: analysis.backgroundCommand!,
    cwd: root,
    requestedBy: "lead",
    timeoutMs: 30_000,
  });
  await taskStore.save({
    ...(await taskStore.load(validationTask!.record.id)),
    description: writeMetadataPatch(validationTask!.record.description, {
      backgroundCommand: analysis.backgroundCommand!,
      jobId: job.id,
    }),
  });
  await backgroundStore.setPid(job.id, 3002);
  await backgroundStore.complete(job.id, {
    status: "completed",
    exitCode: 0,
    output: "ok",
  });

  const reloaded = await loadOrchestratorProgress({
    rootDir: root,
    cwd: root,
    objective: analysis.objective,
  });
  const decision = routeOrchestratorAction({
    analysis,
    progress: reloaded,
    plan: {
      objective: analysis.objective,
      createdTaskIds: [],
      tasks: reloaded.relevantTasks,
      readyTasks: reloaded.readyTasks,
    },
  });

  assert.equal(decision.action, "self_execute");
  assert.doesNotMatch(decision.reason, /Waiting for delegated work/i);
});

function writeMetadataPatch(
  description: string,
  patch: {
    backgroundCommand?: string;
    jobId?: string;
  },
): string {
  const meta = readOrchestratorMetadata(description) as Record<string, unknown> | null;
  assert.ok(meta);
  return [
    String(description).replace(/\s*\[deadmouse-orchestrator\]\s*[\s\S]*$/m, "").trim(),
    "[deadmouse-orchestrator]",
    JSON.stringify(
      {
        ...meta,
        ...patch,
      },
      null,
      2,
    ),
  ]
    .filter((part) => part && part.trim().length > 0)
    .join("\n\n");
}
