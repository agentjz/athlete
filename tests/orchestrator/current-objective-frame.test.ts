import assert from "node:assert/strict";
import test from "node:test";

import { buildInternalWakeInput } from "../../src/agent/checkpoint/prompt.js";
import { createMessage } from "../../src/agent/session/messages.js";
import { MemorySessionStore } from "../../src/agent/session/store.js";
import { initializeTurnSession } from "../../src/agent/turn/persistence.js";
import { hasUnfinishedLeadWork } from "../../src/agent/turn/leadReturnGate.js";
import { runManagedAgentTurn } from "../../src/agent/turn.js";
import { loadPromptRuntimeState } from "../../src/agent/runtimeState.js";
import { BackgroundJobStore } from "../../src/execution/background.js";
import { ExecutionStore } from "../../src/execution/store.js";
import { ProtocolRequestStore } from "../../src/capabilities/team/requestStore.js";
import { TaskStore } from "../../src/tasks/store.js";
import { taskListTool } from "../../src/capabilities/tools/packages/tasks/taskListTool.js";
import { buildOrchestratorObjective, writeOrchestratorMetadata } from "../../src/orchestrator/metadata.js";
import type { ToolContext } from "../../src/capabilities/tools/core/types.js";
import type { SessionCheckpoint } from "../../src/types.js";
import { createCheckpointFixture, createTempWorkspace, createTestRuntimeConfig, initGitRepo, makeToolContext } from "../helpers.js";

test("new user objective starts a fresh current task frame", async (t) => {
  const root = await createTempWorkspace("current-objective-frame", t);
  const sessionStore = new MemorySessionStore();
  let session = await sessionStore.create(root);
  session = await sessionStore.save({
    ...session,
    messages: [
      createMessage("user", "Old task: collect Helldivers news"),
      createMessage("tool", JSON.stringify({
        items: [
          { id: "1", text: "Collect old news sources", status: "in_progress" },
        ],
      }), { name: "todo_write" }),
    ],
    checkpoint: createCheckpointFixture("Old task: collect Helldivers news", {
      priorityArtifacts: [{
        kind: "tool_preview",
        label: "old news evidence",
        path: ".deadmouse/tool-results/old-news.json",
      }],
    }) as unknown as SessionCheckpoint,
  });

  const next = await initializeTurnSession(session, "New task: demonstrate teammate dispatch and return", sessionStore);

  assert.equal(next.taskState?.objective, "New task: demonstrate teammate dispatch and return");
  assert.deepEqual(next.todoItems, []);
  assert.equal(next.checkpoint?.objective, "Old task: collect Helldivers news");
  assert.equal(next.checkpoint?.priorityArtifacts?.[0]?.label, "old news evidence");
});

test("internal wake input is only a doorbell and does not replay checkpoint scripts", () => {
  const prompt = buildInternalWakeInput({ kind: "lead", name: "lead" });

  assert.match(prompt, /Wake lead runtime/);
  assert.doesNotMatch(prompt, /Resume the current task/i);
  assert.doesNotMatch(prompt, /Old objective|old\.json|Repeat the previous answer/);
});

test("literal continue remains the latest user input instead of restoring a checkpoint", async (t) => {
  const root = await createTempWorkspace("literal-continue-frame", t);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.save({
    ...(await sessionStore.create(root)),
    checkpoint: createCheckpointFixture("Old objective: collect evidence") as unknown as SessionCheckpoint,
  });

  const next = await initializeTurnSession(session, "continue", sessionStore);

  assert.equal(next.taskState?.objective, "continue");
  assert.equal(next.checkpoint?.objective, "Old objective: collect evidence");
});

test("task_list shows current objective tasks and counts other-objective tasks", async (t) => {
  const root = await createTempWorkspace("current-task-list", t);
  const current = buildOrchestratorObjective("New task: demonstrate dispatch and return");
  const old = buildOrchestratorObjective("Old task: collect Helldivers news");
  const store = new TaskStore(root);
  await store.create(
    `Implement: ${old.text}`,
    writeOrchestratorMetadata("old", {
      key: old.key,
      kind: "implementation",
      objective: old.text,
      executor: "lead",
    }),
  );
  await store.create(
    `Implement: ${current.text}`,
    writeOrchestratorMetadata("current", {
      key: current.key,
      kind: "implementation",
      objective: current.text,
      executor: "lead",
    }),
  );

  const result = await taskListTool.execute("{}", makeToolContext(root, root, {
    currentObjective: current,
  }) as unknown as ToolContext);
  const payload = JSON.parse(result.output) as { tasks: Array<{ subject: string }>; otherObjectiveTaskCount: number; preview: string };

  assert.equal(payload.tasks.length, 1);
  assert.equal(payload.otherObjectiveTaskCount, 1);
  assert.match(payload.preview, /demonstrate dispatch and return/);
  assert.doesNotMatch(payload.preview, /Helldivers/);
});

test("prompt runtime state exposes only current objective runtime facts", async (t) => {
  const root = await createTempWorkspace("current-runtime-state", t);
  const current = buildOrchestratorObjective("Current objective: inspect README");
  const old = buildOrchestratorObjective("Old objective: browse stale websites");
  const taskStore = new TaskStore(root);
  await taskStore.create(
    `Implement: ${old.text}`,
    writeOrchestratorMetadata("old", {
      key: old.key,
      kind: "implementation",
      objective: old.text,
      executor: "lead",
    }),
  );
  await taskStore.create(
    `Implement: ${current.text}`,
    writeOrchestratorMetadata("current", {
      key: current.key,
      kind: "implementation",
      objective: current.text,
      executor: "lead",
    }),
  );

  const executionStore = new ExecutionStore(root);
  const oldExecution = await executionStore.create({
    lane: "agent",
    profile: "subagent",
    launch: "worker",
    requestedBy: "lead",
    actorName: "subagent-old",
    objectiveKey: old.key,
    objectiveText: old.text,
    cwd: root,
    prompt: "Inspect stale logs.",
    worktreePolicy: "none",
  });
  await executionStore.start(oldExecution.id, { pid: process.pid });
  const currentExecution = await executionStore.create({
    lane: "agent",
    profile: "subagent",
    launch: "worker",
    requestedBy: "lead",
    actorName: "subagent-current",
    objectiveKey: current.key,
    objectiveText: current.text,
    cwd: root,
    prompt: "Inspect README.",
    worktreePolicy: "none",
  });
  await executionStore.start(currentExecution.id, { pid: process.pid });

  const oldBackground = await new BackgroundJobStore(root).create({
    command: "old-command",
    cwd: root,
    requestedBy: "lead",
    timeoutMs: 120_000,
    objectiveKey: old.key,
    objectiveText: old.text,
  });
  await new BackgroundJobStore(root).setPid(oldBackground.id, process.pid);

  await new ProtocolRequestStore(root).create({
    kind: "shutdown",
    from: "lead",
    to: "old-teammate",
    subject: "Old objective shutdown",
    content: "Old objective details that should stay out of the current prompt.",
  });

  const runtime = await loadPromptRuntimeState(root, { kind: "lead", name: "lead" }, root, current.text);

  assert.match(runtime.taskSummary ?? "", /Current objective/);
  assert.match(runtime.teamSummary ?? "", /subagent-current/);
  assert.doesNotMatch([
    runtime.taskSummary,
    runtime.teamSummary,
    runtime.backgroundSummary,
    runtime.protocolSummary,
  ].join("\n"), /Helldivers|stale|old-command|old-teammate|Old objective/);
});

test("current objective gates ignore old objective executions", async (t) => {
  const root = await createTempWorkspace("current-return-gate-execution", t);
  const current = buildOrchestratorObjective("New objective: answer a separate question");
  const old = buildOrchestratorObjective("Old objective: delegated implementation");
  const oldTask = await new TaskStore(root).create(
    `Implement: ${old.text}`,
    writeOrchestratorMetadata("old implementation", {
      key: old.key,
      kind: "implementation",
      objective: old.text,
      executor: "teammate",
    }),
  );
  const executionStore = new ExecutionStore(root);
  const execution = await executionStore.create({
    lane: "agent",
    profile: "teammate",
    launch: "worker",
    requestedBy: "lead",
    actorName: "teammate-old",
    taskId: oldTask.id,
    cwd: root,
    prompt: "Keep working on the old objective.",
    worktreePolicy: "task",
  });
  await executionStore.start(execution.id, { pid: process.pid });

  assert.equal(await hasUnfinishedLeadWork(root, current.text), false);
  assert.equal(await hasUnfinishedLeadWork(root, old.text), true);
});

test("delegation capability availability does not create machine tasks or executions", async (t) => {
  const root = await createTempWorkspace("dead-machine-no-auto-plan", t);
  await initGitRepo(root);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);
  const seenInputs: string[] = [];

  const result = await runManagedAgentTurn({
    input: "Please ask a teammate and subagent to inspect this issue.",
    cwd: root,
    config: createTestRuntimeConfig(root),
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

  assert.equal(seenInputs.length, 1);
  assert.equal(seenInputs[0], "Please ask a teammate and subagent to inspect this issue.");
  assert.equal((await new TaskStore(root).list()).length, 0);
  assert.equal((await new ExecutionStore(root).list()).length, 0);
  assert.notEqual(result.paused, true);
});
