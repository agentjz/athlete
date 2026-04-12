import assert from "node:assert/strict";
import test from "node:test";

import { runManagedAgentTurn } from "../src/agent/turn.js";
import { MemorySessionStore } from "../src/agent/session.js";
import { BackgroundJobStore } from "../src/background/store.js";
import { buildOrchestratorObjective, readOrchestratorMetadata, writeOrchestratorMetadata } from "../src/orchestrator/metadata.js";
import { TeamStore } from "../src/team/store.js";
import { ensureTaskPlan } from "../src/orchestrator/taskPlanning.js";
import { TaskStore } from "../src/tasks/store.js";
import { createCheckpointFixture, createTempWorkspace, createTestRuntimeConfig, initGitRepo } from "./helpers.js";

test("runManagedAgentTurn keeps continuation behavior after lead orchestration seeds the task board", async (t) => {
  const root = await createTempWorkspace("orchestrator-managed", t);
  await initGitRepo(root);
  const sessionStore = new MemorySessionStore();
  const initialSession = await sessionStore.save({
    ...(await sessionStore.create(root)),
    checkpoint: createCheckpointFixture("Refactor the CLI flow and validate the runtime behavior afterwards.", {
      completedSteps: ["Seeded the persistent task board"],
      nextStep: "Continue the active implementation task instead of reseeding the plan.",
      flow: {
        phase: "continuation",
      },
    }),
  } as any);
  const seenInputs: string[] = [];
  let sliceCount = 0;

  const result = await runManagedAgentTurn({
    input: "Refactor the CLI flow and validate the runtime behavior afterwards.",
    cwd: root,
    config: createTestRuntimeConfig(root),
    session: initialSession,
    sessionStore,
    runSlice: async (options) => {
      sliceCount += 1;
      seenInputs.push(options.input);
      return {
        session: options.session,
        changedPaths: [],
        verificationAttempted: false,
        yielded: sliceCount === 1,
      };
    },
  });

  const tasks = await new TaskStore(root).list();
  assert.equal(sliceCount, 2);
  assert.equal(result.yielded, false);
  assert.match(String(seenInputs[0]), /Stage:\s*implementation/i);
  assert.match(String(seenInputs[0]), /<base-input>[\s\S]*Refactor the CLI flow and validate the runtime behavior afterwards\./i);
  assert.match(String(seenInputs[1]), /Seeded the persistent task board/i);
  assert.match(String(seenInputs[1]), /Continue the active implementation task/i);
  assert.ok(tasks.length >= 2);
});

test("runManagedAgentTurn dispatches teammate work and then waits instead of entering a lead slice", async (t) => {
  const root = await createTempWorkspace("orchestrator-dispatch-wait", t);
  await initGitRepo(root);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);
  await new TeamStore(root).upsertMember("worker-1", "implementer", "idle", {
    pid: process.pid,
    sessionId: "worker-session",
  });
  let sliceCalls = 0;

  const result = await runManagedAgentTurn({
    input: "Refactor the CLI flow in parallel with a teammate, then validate and merge the result without losing the task graph.",
    cwd: root,
    config: createTestRuntimeConfig(root),
    session,
    sessionStore,
    runSlice: async () => {
      sliceCalls += 1;
      throw new Error("lead slice should not run while delegated work is waiting");
    },
  });

  const tasks = await new TaskStore(root).list();
  const implementation = tasks.find((task) => task.subject.startsWith("Implement:"));

  assert.ok(implementation);
  assert.equal(implementation?.assignee, "worker-1");
  assert.equal(sliceCalls, 0);
  assert.equal(result.paused, true);
  assert.equal(result.transition?.reason.code, "pause.orchestrator_waiting_for_delegated_work");
  assert.match(String(result.pauseReason ?? ""), /worker-1|teammate/i);
});

test("runManagedAgentTurn formally waits for active delegated work instead of re-entering the lead turn", async (t) => {
  const root = await createTempWorkspace("orchestrator-active-wait", t);
  await initGitRepo(root);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);
  const objectiveText = "Run the validation suite in the background, then merge the reviewed result.";
  const objective = buildOrchestratorObjective(objectiveText);
  await ensureTaskPlan({
    rootDir: root,
    cwd: root,
    analysis: {
      objective,
      complexity: "moderate",
      needsInvestigation: false,
      prefersParallel: false,
      wantsBackground: true,
      wantsSubagent: false,
      wantsTeammate: false,
      backgroundCommand: "npm test -- --watch=false",
    },
    existingTasks: [],
  });
  const taskStore = new TaskStore(root);
  const implementation = (await taskStore.list()).find((task) => task.subject.startsWith("Implement:"));
  const validation = (await taskStore.list()).find((task) => task.subject.startsWith("Validate:"));
  assert.ok(implementation);
  assert.ok(validation);
  await taskStore.update(implementation!.id, {
    status: "completed",
  });
  const validationMeta = readOrchestratorMetadata(validation!.description);
  assert.ok(validationMeta);
  const job = await new BackgroundJobStore(root).create({
    command: "npm test -- --watch=false",
    cwd: root,
    requestedBy: "lead",
    timeoutMs: 30_000,
  });
  await taskStore.save({
    ...(await taskStore.load(validation!.id)),
    description: writeOrchestratorMetadata(validation!.description, {
      ...validationMeta!,
      backgroundCommand: "npm test -- --watch=false",
      jobId: job.id,
    }),
  });
  let sliceCalls = 0;

  const result = await runManagedAgentTurn({
    input: objectiveText,
    cwd: root,
    config,
    session,
    sessionStore,
    runSlice: async () => {
      sliceCalls += 1;
      throw new Error("lead slice should stay parked while teammate work is active");
    },
  });

  assert.equal(sliceCalls, 0);
  assert.equal(result.paused, true);
  assert.equal(result.transition?.reason.code, "pause.orchestrator_waiting_for_delegated_work");
});

test("runManagedAgentTurn enters merge as an explicit orchestration stage", async (t) => {
  const root = await createTempWorkspace("orchestrator-merge-stage", t);
  await initGitRepo(root);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);
  const objectiveText = "Refactor the CLI flow in parallel with a teammate, validate it, and merge the delegated result.";
  const objective = buildOrchestratorObjective(objectiveText);
  await ensureTaskPlan({
    rootDir: root,
    cwd: root,
    analysis: {
      objective,
      complexity: "complex",
      needsInvestigation: false,
      prefersParallel: true,
      wantsBackground: false,
      wantsSubagent: false,
      wantsTeammate: true,
      backgroundCommand: undefined,
    },
    existingTasks: [],
  });
  const taskStore = new TaskStore(root);
  const implementation = (await taskStore.list()).find((task) => task.subject.startsWith("Implement:"));
  const validation = (await taskStore.list()).find((task) => task.subject.startsWith("Validate:"));
  assert.ok(implementation);
  assert.ok(validation);
  await taskStore.update(implementation!.id, {
    status: "completed",
  });
  await taskStore.update(validation!.id, {
    status: "completed",
  });

  const seenInputs: string[] = [];
  const result = await runManagedAgentTurn({
    input: objectiveText,
    cwd: root,
    config,
    session,
    sessionStore,
    runSlice: async (options) => {
      seenInputs.push(options.input);
      return {
        session: options.session,
        changedPaths: [],
        verificationAttempted: false,
        yielded: false,
      };
    },
  });

  assert.notEqual(result.paused, true);
  assert.equal(seenInputs.length, 1);
  assert.match(String(seenInputs[0]), /Stage:\s*merge/i);
  assert.match(String(seenInputs[0]), /Task #\d+/i);
});
