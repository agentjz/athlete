import assert from "node:assert/strict";
import test from "node:test";

import { runManagedAgentTurn } from "../src/agent/turn.js";
import { MemorySessionStore } from "../src/agent/session.js";
import { BackgroundJobStore } from "../src/execution/background.js";
import { ExecutionStore } from "../src/execution/store.js";
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

test("runManagedAgentTurn dispatches teammate work, waits internally, then enters a lead slice once delegation state changes", async (t) => {
  const root = await createTempWorkspace("orchestrator-dispatch-wait", t);
  await initGitRepo(root);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);
  await new TeamStore(root).upsertMember("worker-1", "implementer", "idle", {
    pid: process.pid,
    sessionId: "worker-session",
  });
  let sliceCalls = 0;
  const closePromise = closeActiveTeammateExecutionsEventually(root);

  const result = await runManagedAgentTurn({
    input: "Delegate to teammate worker-1 for implementation, then validate and merge the result without losing the task graph.",
    cwd: root,
    config: createTestRuntimeConfig(root),
    session,
    sessionStore,
    runSlice: async (options) => {
      sliceCalls += 1;
      return {
        session: options.session,
        changedPaths: [],
        verificationAttempted: false,
        yielded: false,
      };
    },
  });

  const tasks = await new TaskStore(root).list();
  const implementation = tasks.find((task) => task.subject.startsWith("Implement:"));
  await closePromise;

  assert.ok(implementation);
  assert.equal(implementation?.assignee, "worker-1");
  assert.equal(sliceCalls, 1);
  assert.notEqual(result.paused, true);
});

test("runManagedAgentTurn keeps waiting inside the lead loop for active delegated work, then resumes without pause", async (t) => {
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
  const backgroundStore = new BackgroundJobStore(root);
  const job = await backgroundStore.create({
    command: "npm test -- --watch=false",
    cwd: root,
    requestedBy: "lead",
    timeoutMs: 30_000,
  });
  await backgroundStore.setPid(job.id, process.pid);
  await taskStore.save({
    ...(await taskStore.load(validation!.id)),
    description: writeOrchestratorMetadata(validation!.description, {
      ...validationMeta!,
      backgroundCommand: "npm test -- --watch=false",
      jobId: job.id,
    }),
  });
  let sliceCalls = 0;
  const completePromise = completeBackgroundEventually(root, job.id);

  const result = await runManagedAgentTurn({
    input: objectiveText,
    cwd: root,
    config,
    session,
    sessionStore,
    runSlice: async (options) => {
      sliceCalls += 1;
      return {
        session: options.session,
        changedPaths: [],
        verificationAttempted: false,
        yielded: false,
      };
    },
  });
  await completePromise;

  assert.equal(sliceCalls, 1);
  assert.notEqual(result.paused, true);
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

test("runManagedAgentTurn keeps orchestrating when a lead slice spawns delegated teammate work", async (t) => {
  const root = await createTempWorkspace("orchestrator-slice-spawned-delegation", t);
  await initGitRepo(root);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);
  let sliceCalls = 0;

  const result = await runManagedAgentTurn({
    input: "Check latest news and summarize briefly.",
    cwd: root,
    config,
    session,
    sessionStore,
    runSlice: async (options) => {
      sliceCalls += 1;
      if (sliceCalls === 1) {
        const executionStore = new ExecutionStore(root);
        const execution = await executionStore.create({
          lane: "agent",
          profile: "teammate",
          launch: "worker",
          requestedBy: "lead",
          actorName: "researcher-news",
          actorRole: "researcher",
          cwd: root,
          prompt: "Gather latest news updates.",
        });
        await executionStore.start(execution.id, {
          pid: process.pid,
        });
        setTimeout(() => {
          void executionStore.close(execution.id, {
            status: "completed",
            summary: "delegated research done",
            resultText: "ok",
          }).catch(() => undefined);
        }, 200);
      }

      return {
        session: options.session,
        changedPaths: [],
        verificationAttempted: false,
        yielded: false,
      };
    },
  });

  assert.notEqual(result.paused, true);
  assert.equal(sliceCalls, 2);
});

async function closeActiveTeammateExecutions(rootDir: string): Promise<void> {
  const executionStore = new ExecutionStore(rootDir);
  const active = await executionStore.listRelevant({
    requestedBy: "lead",
    profile: "teammate",
    statuses: ["queued", "running"],
  });
  for (const execution of active) {
    await executionStore.close(execution.id, {
      status: "completed",
      summary: "teammate execution completed for test orchestration flow",
      resultText: "ok",
    });
  }
}

async function closeActiveTeammateExecutionsEventually(rootDir: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  let observedActive = false;
  for (;;) {
    const active = await new ExecutionStore(rootDir).listRelevant({
      requestedBy: "lead",
      profile: "teammate",
      statuses: ["queued", "running"],
    });
    if (active.length > 0) {
      observedActive = true;
      await closeActiveTeammateExecutions(rootDir);
      const remaining = await new ExecutionStore(rootDir).listRelevant({
        requestedBy: "lead",
        profile: "teammate",
        statuses: ["queued", "running"],
      });
      if (remaining.length === 0) {
        return;
      }
    }
    if (observedActive && active.length === 0) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting to close teammate executions.");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function completeBackgroundEventually(rootDir: string, jobId: string): Promise<void> {
  const store = new BackgroundJobStore(rootDir);
  const deadline = Date.now() + 15_000;
  for (;;) {
    const job = await store.load(jobId);
    if (job.status === "completed") {
      return;
    }
    if (job.status === "running") {
      await store.complete(job.id, {
        status: "completed",
        exitCode: 0,
        output: "background validation complete",
      });
      return;
    }
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for background job to reach completable state.");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
