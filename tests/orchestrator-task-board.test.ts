import assert from "node:assert/strict";
import test from "node:test";

import { ensureTaskPlan } from "../src/orchestrator/taskPlanning.js";
import { loadOrchestratorProgress } from "../src/orchestrator/progress.js";
import { readOrchestratorMetadata, writeOrchestratorMetadata } from "../src/orchestrator/metadata.js";
import { TaskStore } from "../src/tasks/store.js";
import { TeamStore } from "../src/team/store.js";
import { createTempWorkspace } from "./helpers.js";

test("ensureTaskPlan writes a minimal persistent task graph for complex lead work", async (t) => {
  const root = await createTempWorkspace("orchestrator-plan", t);
  const plan = await ensureTaskPlan({
    rootDir: root,
    cwd: root,
    analysis: {
      objective: {
        key: "objective-graph",
        text: "Refactor the CLI flow, then validate the runtime behavior.",
      },
      complexity: "complex",
      needsInvestigation: true,
      prefersParallel: true,
      wantsBackground: false,
      wantsSubagent: true,
      wantsTeammate: true,
      backgroundCommand: undefined,
    },
    existingTasks: [],
  });

  const store = new TaskStore(root);
  const tasks = await store.list();
  const survey = tasks.find((task) => task.subject.startsWith("Survey:"));
  const implementation = tasks.find((task) => task.subject.startsWith("Implement:"));
  const validation = tasks.find((task) => task.subject.startsWith("Validate:"));
  const merge = tasks.find((task) => task.subject.startsWith("Merge:"));

  assert.equal(plan.createdTaskIds.length, 4);
  assert.equal(tasks.length, 4);
  assert.ok(survey);
  assert.ok(implementation);
  assert.ok(validation);
  assert.ok(merge);
  assert.deepEqual(implementation?.blockedBy, [survey?.id]);
  assert.deepEqual(validation?.blockedBy, [implementation?.id]);
  assert.deepEqual(merge?.blockedBy, [validation?.id]);
  assert.match(String(survey?.description ?? ""), /athlete-orchestrator/i);
});

test("loadOrchestratorProgress keeps teammate-reserved work off the lead-ready list and records who can pick it up", async (t) => {
  const root = await createTempWorkspace("orchestrator-plan-teammate", t);
  const analysis = {
    objective: {
      key: "objective-teammate-ready",
      text: "Refactor the CLI flow in parallel with a teammate.",
    },
    complexity: "complex" as const,
    needsInvestigation: false,
    prefersParallel: true,
    wantsBackground: false,
    wantsSubagent: false,
    wantsTeammate: true,
    backgroundCommand: undefined,
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
  await taskStore.assign(implementation!.id, "worker-1");
  await new TeamStore(root).upsertMember("worker-1", "implementer", "idle");

  const progress = await loadOrchestratorProgress({
    rootDir: root,
    cwd: root,
    objective: analysis.objective,
  });
  const implementationSnapshot = progress.relevantTasks.find((task) => task.record.id === implementation!.id);

  assert.ok(implementationSnapshot);
  assert.equal(progress.readyTasks.some((task) => task.record.id === implementation!.id), false);
  assert.equal((implementationSnapshot as any).lifecycle?.stage, "ready");
  assert.equal((implementationSnapshot as any).lifecycle?.runnableBy?.kind, "teammate");
  assert.equal((implementationSnapshot as any).lifecycle?.runnableBy?.name, "worker-1");
});

test("loadOrchestratorProgress fails closed when a background handoff points to a missing job", async (t) => {
  const root = await createTempWorkspace("orchestrator-plan-missing-job", t);
  const analysis = {
    objective: {
      key: "objective-missing-job",
      text: "Run the validation suite in the background.",
    },
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
  const meta = readOrchestratorMetadata(implementation!.description);
  assert.ok(meta);
  await taskStore.claim(implementation!.id, "lead");
  await taskStore.save({
    ...(await taskStore.load(implementation!.id)),
    description: writeOrchestratorMetadata(implementation!.description, {
      ...meta!,
      backgroundCommand: analysis.backgroundCommand,
      jobId: "missing-job",
    }),
  });

  const progress = await loadOrchestratorProgress({
    rootDir: root,
    cwd: root,
    objective: analysis.objective,
  });
  const implementationSnapshot = progress.relevantTasks.find((task) => task.record.id === implementation!.id);

  assert.ok(implementationSnapshot);
  assert.equal(progress.readyTasks.some((task) => task.record.id === implementation!.id), false);
  assert.equal((implementationSnapshot as any).lifecycle?.stage, "blocked");
  assert.equal((implementationSnapshot as any).lifecycle?.illegal, true);
  assert.match(String((implementationSnapshot as any).lifecycle?.reason ?? ""), /missing-job/i);
});
