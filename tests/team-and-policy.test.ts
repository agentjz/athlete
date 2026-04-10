import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { injectInboxMessagesIfNeeded } from "../src/agent/runtimeState.js";
import { MemorySessionStore } from "../src/agent/session.js";
import { MessageBus } from "../src/team/messageBus.js";
import { CoordinationPolicyStore } from "../src/team/policyStore.js";
import { ProtocolRequestStore } from "../src/team/requestStore.js";
import { TeamStore } from "../src/team/store.js";
import { coordinationPolicyTool } from "../src/tools/team/coordinationPolicyTool.js";
import { planApprovalTool } from "../src/tools/team/planApprovalTool.js";
import { shutdownRequestTool } from "../src/tools/team/shutdownRequestTool.js";
import { todoWriteTool } from "../src/tools/tasks/todoWriteTool.js";
import { TaskStore } from "../src/tasks/store.js";
import { createTempWorkspace, makeToolContext } from "./helpers.js";

test("team messaging drains inboxes and archives messages", async (t) => {
  const root = await createTempWorkspace("team-msg", t);
  const bus = new MessageBus(root);
  const sessionStore = new MemorySessionStore();

  await bus.send("lead", "alpha", "hello alpha");
  const teammateSession = await sessionStore.create(root);
  const injected = await injectInboxMessagesIfNeeded(
    teammateSession,
    { sessionStore } as any,
    { kind: "teammate", name: "alpha", role: "writer", teamName: "default" },
    root,
  );

  assert.equal(injected.messages.length, 1);
  assert.equal((await bus.peekInbox("alpha")).length, 0);

  const log = await fs.readFile(path.join(root, ".athlete", "team", "messages.jsonl"), "utf8");
  assert.match(log, /"to":"alpha"/);
});

test("todo_write syncs active teammate plans into the task board", async (t) => {
  const root = await createTempWorkspace("todo-sync", t);
  const taskStore = new TaskStore(root);
  const task = await taskStore.create("alpha task", "", { assignee: "alpha" });
  await taskStore.claim(task.id, "alpha");

  const result = await todoWriteTool.execute(
    JSON.stringify({
      items: [
        { id: "1", text: "step one", status: "completed" },
        { id: "2", text: "step two", status: "in_progress" },
      ],
    }),
    makeToolContext(root, root, {
      identity: { kind: "teammate", name: "alpha", role: "writer", teamName: "default" },
    }) as any,
  );

  const reloaded = await taskStore.load(task.id);
  assert.equal(result.ok, true);
  assert.equal(reloaded.checklist?.length, 2);
  assert.equal(reloaded.checklist?.[1]?.status, "in_progress");
});

test("coordination policy gates plan approvals and shutdown requests", async (t) => {
  const root = await createTempWorkspace("policy", t);
  const leadContext = makeToolContext(root) as any;
  const teamStore = new TeamStore(root);
  await teamStore.upsertMember("alpha", "writer", "idle");

  const policyStore = new CoordinationPolicyStore(root);
  const initial = await policyStore.load();
  assert.equal(initial.allowPlanDecisions, false);
  assert.equal(initial.allowShutdownRequests, false);

  const requestStore = new ProtocolRequestStore(root);
  const request = await requestStore.create({
    kind: "plan_approval",
    from: "alpha",
    to: "lead",
    subject: "Plan review from alpha",
    content: "test plan",
  });

  await assert.rejects(
    () => planApprovalTool.execute(JSON.stringify({ request_id: request.id, approve: true }), leadContext),
    /coordination policy/i,
  );
  await assert.rejects(
    () => shutdownRequestTool.execute(JSON.stringify({ teammate: "alpha", reason: "done" }), leadContext),
    /coordination policy/i,
  );

  await coordinationPolicyTool.execute(
    JSON.stringify({ allow_plan_decisions: true, allow_shutdown_requests: true }),
    leadContext,
  );

  const approval = await planApprovalTool.execute(
    JSON.stringify({ request_id: request.id, approve: true, feedback: "ok" }),
    leadContext,
  );
  const shutdown = await shutdownRequestTool.execute(
    JSON.stringify({ teammate: "alpha", reason: "done" }),
    leadContext,
  );

  assert.match(approval.output, /approved/i);
  assert.match(shutdown.output, /Shutdown request/i);
});
