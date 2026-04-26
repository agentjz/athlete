import assert from "node:assert/strict";
import test from "node:test";

import { createMessage } from "../src/agent/session/messages.js";
import { MemorySessionStore } from "../src/agent/session/store.js";
import { buildCheckpointContinuationInput } from "../src/agent/checkpoint/prompt.js";
import { getPlanBlockedResult } from "../src/agent/turn/planGate.js";
import { initializeTurnSession } from "../src/agent/turn/persistence.js";
import { hasUnfinishedLeadWork } from "../src/agent/turn/leadReturnGate.js";
import { loadPromptRuntimeState } from "../src/agent/runtimeState.js";
import { loadProjectContext } from "../src/context/projectContext.js";
import { ExecutionStore } from "../src/execution/store.js";
import { BackgroundJobStore } from "../src/execution/background.js";
import { analyzeOrchestratorInput } from "../src/orchestrator/analyze.js";
import { dispatchOrchestratorAction } from "../src/orchestrator/dispatch.js";
import { buildOrchestratorObjective, writeOrchestratorMetadata } from "../src/orchestrator/metadata.js";
import { loadOrchestratorProgress } from "../src/orchestrator/progress.js";
import { routeOrchestratorAction } from "../src/orchestrator/route.js";
import { ProtocolRequestStore } from "../src/team/requestStore.js";
import { TeamStore } from "../src/team/store.js";
import { TaskStore } from "../src/tasks/store.js";
import { taskListTool } from "../src/tools/tasks/taskListTool.js";
import type { ToolContext } from "../src/tools/types.js";
import type { SessionCheckpoint } from "../src/types.js";
import { createCheckpointFixture, createTempWorkspace, createTestRuntimeConfig, makeToolContext } from "./helpers.js";

test("new user objective starts a fresh current task frame", async (t) => {
  const root = await createTempWorkspace("current-objective-frame", t);
  const sessionStore = new MemorySessionStore();
  let session = await sessionStore.create(root);
  session = await sessionStore.save({
    ...session,
    messages: [
      createMessage("user", "旧任务：整理 Helldivers 新闻"),
      createMessage("tool", JSON.stringify({
        items: [
          { id: "1", text: "回收旧新闻队友", status: "in_progress" },
        ],
      }), { name: "todo_write" }),
    ],
    checkpoint: createCheckpointFixture("旧任务：整理 Helldivers 新闻", {
      currentStep: "继续整理旧新闻来源",
      nextStep: "输出旧新闻摘要",
      priorityArtifacts: [{
        kind: "pending_path",
        label: "旧新闻证据",
        path: ".deadmouse/tool-results/old-news.json",
      }],
    }) as unknown as SessionCheckpoint,
  });

  const next = await initializeTurnSession(session, "新任务：只演示派出和回收队友", sessionStore);

  assert.equal(next.taskState?.objective, "新任务：只演示派出和回收队友");
  assert.deepEqual(next.todoItems, []);
  assert.equal(next.checkpoint?.objective, "新任务：只演示派出和回收队友");
  assert.equal(next.checkpoint?.currentStep, undefined);
  assert.equal(next.checkpoint?.nextStep, undefined);
  assert.deepEqual(next.checkpoint?.priorityArtifacts, []);
});

test("checkpoint continuation prompt stays thin and does not replay completed objective scripts", () => {
  const prompt = buildCheckpointContinuationInput({ kind: "lead", name: "lead" }, createCheckpointFixture("Old objective: answer thinking mode", {
    status: "completed",
    completedSteps: ["Answered the previous user question"],
    currentStep: "Keep answering the previous question",
    nextStep: "Repeat the previous answer",
    recentToolBatch: {
      summary: "todo_write completed",
    },
    priorityArtifacts: [{
      kind: "pending_path",
      label: "old evidence",
      path: ".deadmouse/tool-results/old.json",
    }],
  }) as unknown as SessionCheckpoint);

  assert.match(prompt, /Resume the current task from the latest progress/);
  assert.doesNotMatch(prompt, /Old objective/);
  assert.doesNotMatch(prompt, /Answered the previous user question/);
  assert.doesNotMatch(prompt, /Repeat the previous answer/);
  assert.doesNotMatch(prompt, /old\.json/);
});

test("task_list shows current objective tasks and hides carryover tasks", async (t) => {
  const root = await createTempWorkspace("current-task-list", t);
  const current = buildOrchestratorObjective("新任务：演示派出和回收队友");
  const old = buildOrchestratorObjective("旧任务：整理 Helldivers 新闻");
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
  const payload = JSON.parse(result.output) as { tasks: Array<{ subject: string }>; carryoverTaskCount: number; preview: string };

  assert.equal(payload.tasks.length, 1);
  assert.equal(payload.carryoverTaskCount, 1);
  assert.match(payload.preview, /演示派出和回收队友/);
  assert.doesNotMatch(payload.preview, /Helldivers/);
});

test("prompt runtime task summary hides carryover task details behind a count", async (t) => {
  const root = await createTempWorkspace("current-runtime-state", t);
  const current = buildOrchestratorObjective("Current objective: inspect README");
  const old = buildOrchestratorObjective("Old objective: browse stale websites");
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

  const runtime = await loadPromptRuntimeState(root, { kind: "lead", name: "lead" }, root, current.text);

  assert.match(runtime.taskSummary ?? "", /Current objective/);
  assert.match(runtime.taskSummary ?? "", /Carryover tasks hidden: 1/);
  assert.doesNotMatch(runtime.taskSummary ?? "", /browse stale websites/);
});

test("prompt runtime state hides carryover executions from the current objective frame", async (t) => {
  const root = await createTempWorkspace("current-runtime-execution-state", t);
  const current = buildOrchestratorObjective("Current objective: inspect README");
  const old = buildOrchestratorObjective("Old objective: inspect stale logs");
  const executionStore = new ExecutionStore(root);
  const oldSubagent = await executionStore.create({
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
  await executionStore.start(oldSubagent.id, {
    pid: process.pid,
  });
  const currentSubagent = await executionStore.create({
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
  await executionStore.start(currentSubagent.id, {
    pid: process.pid,
  });
  const oldBackground = await new BackgroundJobStore(root).create({
    command: "old-command",
    cwd: root,
    requestedBy: "lead",
    timeoutMs: 120_000,
    objectiveKey: old.key,
    objectiveText: old.text,
  });
  await new BackgroundJobStore(root).setPid(oldBackground.id, process.pid);
  const currentBackground = await new BackgroundJobStore(root).create({
    command: "current-command",
    cwd: root,
    requestedBy: "lead",
    timeoutMs: 120_000,
    objectiveKey: current.key,
    objectiveText: current.text,
  });
  await new BackgroundJobStore(root).setPid(currentBackground.id, process.pid);

  const runtime = await loadPromptRuntimeState(root, { kind: "lead", name: "lead" }, root, current.text);

  assert.match(runtime.teamSummary ?? "", /subagent-current/);
  assert.match(runtime.teamSummary ?? "", /Carryover agent executions hidden: 1/);
  assert.doesNotMatch(runtime.teamSummary ?? "", /stale logs|subagent-old/);
  assert.match(runtime.backgroundSummary ?? "", /current-command/);
  assert.match(runtime.backgroundSummary ?? "", /Carryover background jobs hidden: 1/);
  assert.doesNotMatch(runtime.backgroundSummary ?? "", /old-command/);
});

test("prompt runtime state does not replay unscoped protocol request details into a new objective", async (t) => {
  const root = await createTempWorkspace("current-runtime-protocol-state", t);
  await new ProtocolRequestStore(root).create({
    kind: "shutdown",
    from: "lead",
    to: "old-teammate",
    subject: "Old objective shutdown",
    content: "Old objective details that should stay out of the current prompt.",
  });

  const runtime = await loadPromptRuntimeState(
    root,
    { kind: "lead", name: "lead" },
    root,
    "Current objective: inspect README",
  );

  assert.match(runtime.protocolSummary ?? "", /Protocol requests hidden from current prompt: 1/);
  assert.doesNotMatch(runtime.protocolSummary ?? "", /Old objective|old-teammate|shutdown/);
});

test("active execution from an old objective stays carryover and does not force current objective wait", async (t) => {
  const root = await createTempWorkspace("current-objective-execution-carryover", t);
  const current = buildOrchestratorObjective("New objective: update the local README");
  const old = buildOrchestratorObjective("Old objective: run delegated research");
  const taskStore = new TaskStore(root);
  const oldTask = await taskStore.create(
    `Survey: ${old.text}`,
    writeOrchestratorMetadata("old delegated task", {
      key: old.key,
      kind: "survey",
      objective: old.text,
      executor: "subagent",
    }),
  );
  const executionStore = new ExecutionStore(root);
  const oldExecution = await executionStore.create({
    lane: "agent",
    profile: "subagent",
    launch: "worker",
    requestedBy: "lead",
    actorName: "subagent-old",
    taskId: oldTask.id,
    cwd: root,
    prompt: "Keep researching the old objective.",
    worktreePolicy: "none",
  });
  await executionStore.start(oldExecution.id, {
    pid: process.pid,
  });

  const progress = await loadOrchestratorProgress({
    rootDir: root,
    cwd: root,
    objective: current,
  });
  const decision = routeOrchestratorAction({
    analysis: {
      objective: current,
      complexity: "simple",
      wantsBackground: false,
      wantsSubagent: false,
      wantsTeammate: false,
    },
    progress,
    plan: {
      objective: current,
      createdTaskIds: [],
      tasks: progress.relevantTasks,
      readyTasks: progress.readyTasks,
    },
  });

  assert.equal(progress.activeExecutions.length, 0);
  assert.equal(decision.action, "self_execute");
});

test("active execution tagged to the current objective still forces current objective wait", async (t) => {
  const root = await createTempWorkspace("current-objective-execution-wait", t);
  const current = buildOrchestratorObjective("Current objective: keep the active background check visible");
  const executionStore = new ExecutionStore(root);
  const execution = await executionStore.create({
    lane: "command",
    profile: "background",
    launch: "worker",
    requestedBy: "lead",
    actorName: "background-current",
    objectiveKey: current.key,
    objectiveText: current.text,
    cwd: root,
    command: "npm test",
    worktreePolicy: "none",
  });
  await executionStore.start(execution.id, {
    pid: process.pid,
  });

  const progress = await loadOrchestratorProgress({
    rootDir: root,
    cwd: root,
    objective: current,
  });
  const decision = routeOrchestratorAction({
    analysis: {
      objective: current,
      complexity: "simple",
      wantsBackground: false,
      wantsSubagent: false,
      wantsTeammate: false,
    },
    progress,
    plan: {
      objective: current,
      createdTaskIds: [],
      tasks: progress.relevantTasks,
      readyTasks: progress.readyTasks,
    },
  });

  assert.equal(progress.activeExecutions.length, 1);
  assert.equal(decision.action, "wait_for_existing_work");
});

test("lead return gate ignores stale shutdown protocol from a closed teammate", async (t) => {
  const root = await createTempWorkspace("current-return-gate", t);
  const projectContext = await loadProjectContext(root);
  const teamStore = new TeamStore(projectContext.stateRootDir);
  await teamStore.upsertMember("alpha", "旧任务队友", "shutdown");
  await new ProtocolRequestStore(projectContext.stateRootDir).create({
    kind: "shutdown",
    from: "lead",
    to: "alpha",
    subject: "Graceful shutdown for alpha",
    content: "旧任务已经关闭。",
  });

  assert.equal(await hasUnfinishedLeadWork(root), false);
});

test("lead return gate treats old objective executions as carryover for a new objective", async (t) => {
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
  await executionStore.start(execution.id, {
    pid: process.pid,
  });

  assert.equal(await hasUnfinishedLeadWork(root, current.text), false);
  assert.equal(await hasUnfinishedLeadWork(root, old.text), true);
});

test("delegation intent only comes from explicit user prefixes", async (t) => {
  const root = await createTempWorkspace("delegation-prefix-analysis", t);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);

  const plain = analyzeOrchestratorInput({
    input: "请派出一个队友和 subagent 看看这个问题",
    session,
  });
  const slash = analyzeOrchestratorInput({
    input: "/team 请研究这个问题",
    session,
  });
  const team = analyzeOrchestratorInput({
    input: "@team 请研究这个问题",
    session,
  });
  const subagent = analyzeOrchestratorInput({
    input: "@subagent 请研究这个问题",
    session,
  });
  const both = analyzeOrchestratorInput({
    input: "@allpeople 请研究这个问题",
    session,
  });

  assert.equal(plain.wantsTeammate, false);
  assert.equal(plain.wantsSubagent, false);
  assert.equal(slash.wantsTeammate, false);
  assert.equal(slash.wantsSubagent, false);
  assert.equal(team.wantsTeammate, true);
  assert.equal(team.wantsSubagent, false);
  assert.equal(subagent.wantsTeammate, false);
  assert.equal(subagent.wantsSubagent, true);
  assert.equal(both.wantsTeammate, true);
  assert.equal(both.wantsSubagent, true);
});

test("lead cannot spawn delegation lanes without an explicit prefix", async (t) => {
  const root = await createTempWorkspace("delegation-prefix-gate", t);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);

  const blockedTeammate = getPlanBlockedResult("spawn_teammate", "{}", session, { kind: "lead", name: "lead" });
  const blockedSubagent = getPlanBlockedResult("task", "{}", session, { kind: "lead", name: "lead" });
  assert.ok(blockedTeammate);
  assert.ok(blockedSubagent);
  assert.match(blockedTeammate.output, /DELEGATION_PREFIX_REQUIRED/);
  assert.match(blockedSubagent.output, /DELEGATION_PREFIX_REQUIRED/);

  const prefixed = await initializeTurnSession(session, "@team 做一次明确队友演示", sessionStore);
  assert.equal(getPlanBlockedResult("spawn_teammate", "{}", prefixed, { kind: "lead", name: "lead" }), null);
  const wrongLane = getPlanBlockedResult("task", "{}", prefixed, { kind: "lead", name: "lead" });
  assert.ok(wrongLane);
  assert.match(wrongLane.output, /DELEGATION_PREFIX_REQUIRED/);
});

test("orchestrator preserves explicit delegation prefixes before lead tool execution", async (t) => {
  const root = await createTempWorkspace("delegation-prefix-orchestrator", t);
  const sessionStore = new MemorySessionStore();

  const cases = [
    { input: "@team 请研究这个问题", teammate: true, subagent: false },
    { input: "@subagent 请研究这个问题", teammate: false, subagent: true },
    { input: "@allpeople 请研究这个问题", teammate: true, subagent: true },
  ];

  for (const entry of cases) {
    const session = await sessionStore.create(root);
    const analysis = analyzeOrchestratorInput({
      input: entry.input,
      session,
    });
    const dispatched = await dispatchOrchestratorAction({
      rootDir: root,
      cwd: root,
      config: createTestRuntimeConfig(root),
      session,
      sessionStore,
      analysis,
      decision: {
        action: "self_execute",
        reason: "test",
      },
    });

    assert.equal(dispatched.session.taskState?.delegationDirective?.teammate, entry.teammate);
    assert.equal(dispatched.session.taskState?.delegationDirective?.subagent, entry.subagent);
    assert.equal(dispatched.session.taskState?.delegationDirective?.source, "user_prefix");
    const teammateGate = getPlanBlockedResult("spawn_teammate", "{}", dispatched.session, { kind: "lead", name: "lead" });
    const subagentGate = getPlanBlockedResult("task", "{}", dispatched.session, { kind: "lead", name: "lead" });
    assert.equal(teammateGate === null, entry.teammate);
    assert.equal(subagentGate === null, entry.subagent);
  }
});
