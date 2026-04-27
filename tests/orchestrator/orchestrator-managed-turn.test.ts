import assert from "node:assert/strict";
import test from "node:test";

import { runManagedAgentTurn } from "../../src/agent/turn.js";
import { MemorySessionStore } from "../../src/agent/session.js";
import { BackgroundJobStore } from "../../src/execution/background.js";
import { ExecutionStore } from "../../src/execution/store.js";
import { buildOrchestratorObjective, readOrchestratorMetadata, writeOrchestratorMetadata } from "../../src/orchestrator/metadata.js";
import { TeamStore } from "../../src/team/store.js";
import { ensureTaskPlan } from "../../src/orchestrator/taskPlanning.js";
import { TaskStore } from "../../src/tasks/store.js";
import { createCheckpointFixture, createTempWorkspace, createTestRuntimeConfig, initGitRepo } from "../helpers.js";

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
  assert.match(String(seenInputs[1]), /Stage:\s*implementation/i);
  assert.doesNotMatch(String(seenInputs[1]), /Seeded the persistent task board/i);
  assert.doesNotMatch(String(seenInputs[1]), /Continue the active implementation task/i);
  assert.ok(tasks.length >= 2);
});

test("runManagedAgentTurn returns teammate-suitable work to the lead instead of auto-dispatching", async (t) => {
  const root = await createTempWorkspace("orchestrator-dispatch-wait", t);
  await initGitRepo(root);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);
  await new TeamStore(root).upsertMember("worker-1", "implementer", "idle", {
    pid: process.pid,
    sessionId: "worker-session",
  });
  let sliceCalls = 0;
  const seenInputs: string[] = [];

  const result = await runManagedAgentTurn({
    input: "Delegate to teammate worker-1 for implementation, then validate and merge the result without losing the task graph.",
    cwd: root,
    config: createTestRuntimeConfig(root),
    session,
    sessionStore,
    runSlice: async (options) => {
      sliceCalls += 1;
      seenInputs.push(options.input);
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

  assert.ok(implementation);
  assert.equal(implementation?.assignee, "");
  assert.equal(sliceCalls, 1);
  assert.notEqual(result.paused, true);
  assert.match(String(seenInputs[0]), /Stage:\s*implementation/i);
  assert.match(String(seenInputs[0]), /lead-owned stage/i);
});

test("runManagedAgentTurn waits silently in the machine layer for active delegated work", async (t) => {
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
  const seenInputs: string[] = [];
  setTimeout(() => {
    void backgroundStore.complete(job.id, {
      status: "completed",
      exitCode: 0,
      output: "background validation complete",
    });
  }, 5);

  const result = await runManagedAgentTurn({
    input: objectiveText,
    cwd: root,
    config,
    session,
    sessionStore,
    runSlice: async (options) => {
      sliceCalls += 1;
      seenInputs.push(options.input);
      return {
        session: options.session,
        changedPaths: [],
        verificationAttempted: false,
        yielded: false,
      };
    },
  });

  assert.equal(sliceCalls, 1);
  assert.notEqual(result.paused, true);
  assert.doesNotMatch(seenInputs.join("\n"), /active delegated work/i);
  assert.doesNotMatch(seenInputs.join("\n"), /prepare reconciliation/i);
  assert.match(String(seenInputs[0]), /Run the validation suite in the background/i);
});

test("runManagedAgentTurn does not auto-configure teammates just because capability is available", async (t) => {
  const root = await createTempWorkspace("orchestrator-team-capability-no-auto-decision", t);
  await initGitRepo(root);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);
  let sliceCalls = 0;
  const seenInputs: string[] = [];

  const result = await runManagedAgentTurn({
    input: "Please ask a teammate to inspect a webpage and report back.",
    cwd: root,
    config: createTestRuntimeConfig(root),
    session,
    sessionStore,
    runSlice: async (options) => {
      sliceCalls += 1;
      seenInputs.push(options.input);
      return {
        session: options.session,
        changedPaths: [],
        verificationAttempted: false,
        yielded: false,
      };
    },
  });

  const executions = await new ExecutionStore(root).list();
  assert.equal(sliceCalls, 1);
  assert.notEqual(result.paused, true);
  assert.equal(executions.some((execution) => execution.profile === "teammate"), false);
  assert.doesNotMatch(String(seenInputs[0]), /opened the team lane/i);
});

test("runManagedAgentTurn does not precreate merge before delegated results exist", async (t) => {
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
      complexity: "moderate",
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
  assert.equal(String(seenInputs[0]), objectiveText);
});

test("runManagedAgentTurn waits silently when a lead slice spawns delegated teammate work", async (t) => {
  const root = await createTempWorkspace("orchestrator-slice-spawned-delegation", t);
  await initGitRepo(root);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);
  const objective = buildOrchestratorObjective("Check latest news and summarize briefly.");
  let sliceCalls = 0;
  const seenInputs: string[] = [];

  const result = await runManagedAgentTurn({
    input: "Check latest news and summarize briefly.",
    cwd: root,
    config,
    session,
    sessionStore,
    runSlice: async (options) => {
      sliceCalls += 1;
      seenInputs.push(options.input);
      if (sliceCalls === 1) {
        const executionStore = new ExecutionStore(root);
        const execution = await executionStore.create({
          lane: "agent",
          profile: "teammate",
          launch: "worker",
          requestedBy: "lead",
          actorName: "researcher-news",
          actorRole: "researcher",
          objectiveKey: objective.key,
          objectiveText: objective.text,
          cwd: root,
          prompt: "Gather latest news updates.",
        });
        await executionStore.start(execution.id, {
          pid: process.pid,
        });
        setTimeout(() => {
          void closeActiveTeammateExecutions(root);
        }, 250);
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
  assert.doesNotMatch(seenInputs.join("\n"), /active delegated work/i);
  assert.doesNotMatch(seenInputs.join("\n"), /prepare reconciliation/i);
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
