import assert from "node:assert/strict";
import test from "node:test";

import { createMessage } from "../src/agent/session/messages.js";
import { MemorySessionStore } from "../src/agent/session/store.js";
import { getPlanBlockedResult } from "../src/agent/turn/planGate.js";
import { initializeTurnSession } from "../src/agent/turn/persistence.js";
import { hasUnfinishedLeadWork } from "../src/agent/turn/leadReturnGate.js";
import { loadProjectContext } from "../src/context/projectContext.js";
import { analyzeOrchestratorInput } from "../src/orchestrator/analyze.js";
import { buildOrchestratorObjective, writeOrchestratorMetadata } from "../src/orchestrator/metadata.js";
import { ProtocolRequestStore } from "../src/team/requestStore.js";
import { TeamStore } from "../src/team/store.js";
import { TaskStore } from "../src/tasks/store.js";
import { taskListTool } from "../src/tools/tasks/taskListTool.js";
import type { ToolContext } from "../src/tools/types.js";
import type { SessionCheckpoint } from "../src/types.js";
import { createCheckpointFixture, createTempWorkspace, makeToolContext } from "./helpers.js";

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
    input: "@team/subagent 请研究这个问题",
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

  const blocked = getPlanBlockedResult("spawn_teammate", "{}", session, { kind: "lead", name: "lead" });
  assert.ok(blocked);
  assert.match(blocked.output, /DELEGATION_PREFIX_REQUIRED/);

  const prefixed = await initializeTurnSession(session, "@team 做一次明确队友演示", sessionStore);
  const allowed = getPlanBlockedResult("spawn_teammate", "{}", prefixed, { kind: "lead", name: "lead" });
  assert.equal(allowed, null);
});
