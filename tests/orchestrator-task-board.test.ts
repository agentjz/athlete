import assert from "node:assert/strict";
import test from "node:test";

import { ensureTaskPlan } from "../src/orchestrator/taskPlanning.js";
import { loadOrchestratorProgress } from "../src/orchestrator/progress.js";
import { readOrchestratorMetadata, resolveOrchestratorExecutor, writeOrchestratorMetadata } from "../src/orchestrator/metadata.js";
import { TaskStore } from "../src/tasks/store.js";
import { TeamStore } from "../src/team/store.js";
import { createTempWorkspace } from "./helpers.js";

test("ensureTaskPlan uses explicit delegation prefixes to select execution lanes", async (t) => {
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
      wantsBackground: false,
      wantsSubagent: true,
      wantsTeammate: true,
      delegationDirective: {
        teammate: true,
        subagent: true,
        source: "user_prefix" as const,
      },
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

  assert.equal(plan.createdTaskIds.length, 3);
  assert.equal(tasks.length, 3);
  assert.ok(survey);
  assert.ok(implementation);
  assert.ok(validation);
  assert.equal(merge, undefined);
  assert.deepEqual(implementation?.blockedBy, []);
  assert.deepEqual(validation?.blockedBy, [implementation?.id]);
  assert.match(String(survey?.description ?? ""), /deadmouse-orchestrator/i);
  assert.equal(readOrchestratorMetadata(survey!.description)?.executor, "subagent");
  assert.equal(readOrchestratorMetadata(implementation!.description)?.executor, "teammate");
  assert.equal(readOrchestratorMetadata(validation!.description)?.executor, "lead");
});

test("loadOrchestratorProgress keeps teammate-reserved work off the lead-ready list and records who can pick it up", async (t) => {
  const root = await createTempWorkspace("orchestrator-plan-teammate", t);
  const analysis = {
    objective: {
      key: "objective-teammate-ready",
      text: "Refactor the CLI flow in parallel with a teammate.",
    },
    complexity: "moderate" as const,
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

test("executor inference does not turn complexity or survey shape into agent-lane authorization", () => {
  const complexLeadOnly = {
    complexity: "complex" as const,
    wantsBackground: false,
    wantsSubagent: false,
    wantsTeammate: false,
    backgroundCommand: undefined,
  };

  assert.equal(
    resolveOrchestratorExecutor({
      meta: {
        key: "complex-lead-only",
        kind: "implementation",
        objective: "Complex but not explicitly delegated.",
      },
    }, complexLeadOnly),
    "lead",
  );
  assert.equal(
    readOrchestratorMetadata(writeOrchestratorMetadata("legacy survey", {
      key: "legacy-survey",
      kind: "survey",
      objective: "Survey-shaped task without explicit executor.",
    }))?.executor,
    "lead",
  );
});

test("loadOrchestratorProgress fails closed when a background handoff points to a missing job", async (t) => {
  const root = await createTempWorkspace("orchestrator-plan-missing-job", t);
  const analysis = {
    objective: {
      key: "objective-missing-job",
      text: "Run the validation suite in the background.",
    },
    complexity: "moderate" as const,
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
