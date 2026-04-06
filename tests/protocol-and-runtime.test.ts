import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { MessageBus } from "../src/team/messageBus.js";
import { ProtocolRequestStore } from "../src/team/requestStore.js";
import { todoWriteTool } from "../src/tools/tasks/todoWriteTool.js";
import { claimTaskTool } from "../src/tools/tasks/claimTaskTool.js";
import { TaskStore } from "../src/tasks/store.js";
import { WorktreeStore } from "../src/worktrees/store.js";
import { createTempWorkspace, initGitRepo, makeToolContext } from "./helpers.js";

test("ProtocolRequestStore summarizes pending and resolved protocol requests", async (t) => {
  const root = await createTempWorkspace("protocol", t);
  const store = new ProtocolRequestStore(root);

  const pending = await store.create({
    kind: "plan_approval",
    from: "alpha",
    to: "lead",
    subject: "Plan review from alpha",
    content: "plan text",
  });
  const resolved = await store.create({
    kind: "shutdown",
    from: "lead",
    to: "beta",
    subject: "Graceful shutdown for beta",
    content: "done",
  });
  await store.resolve(resolved.id, {
    approve: true,
    feedback: "ok",
    respondedBy: "beta",
  });

  const summary = await store.summarize();
  assert.match(summary, new RegExp(`\[>\].*${pending.id}`));
  assert.match(summary, new RegExp(`\[x\].*${resolved.id}`));
});

test("MessageBus converts malformed inbox lines into safe protocol error messages", async (t) => {
  const root = await createTempWorkspace("mailbox", t);
  const inboxDir = path.join(root, ".athlete", "team", "inbox");
  await fs.mkdir(inboxDir, { recursive: true });
  await fs.writeFile(
    path.join(inboxDir, "alpha.jsonl"),
    ['{"broken":', JSON.stringify({ protocolVersion: 999, type: "message", from: "lead", content: "x", timestamp: Date.now() })].join("\n"),
    "utf8",
  );

  const messages = await new MessageBus(root).peekInbox("alpha");
  assert.equal(messages.length, 2);
  assert.equal(messages[0]?.from, "system");
  assert.match(String(messages[0]?.content ?? ""), /Protocol error/i);
  assert.match(String(messages[1]?.content ?? ""), /Unsupported protocolVersion/i);
});

test("todo_write can sync a task checklist from worktree cwd, not only from teammate ownership", async (t) => {
  const root = await createTempWorkspace("worktree-cwd", t);
  await initGitRepo(root);

  const taskStore = new TaskStore(root);
  const task = await taskStore.create("runtime task", "", { assignee: "alpha" });

  await claimTaskTool.execute(
    JSON.stringify({ task_id: task.id }),
    makeToolContext(root, root, {
      identity: { kind: "teammate", name: "alpha", role: "writer", teamName: "default" },
    }) as any,
  );

  const claimed = await taskStore.load(task.id);
  const worktree = await new WorktreeStore(root).get(claimed.worktree);

  await todoWriteTool.execute(
    JSON.stringify({
      items: [
        { id: "1", text: "inside worktree", status: "completed" },
        { id: "2", text: "still running", status: "in_progress" },
      ],
    }),
    makeToolContext(root, worktree.path, {
      identity: { kind: "lead", name: "lead" },
    }) as any,
  );

  const updated = await taskStore.load(task.id);
  assert.equal(updated.checklist?.length, 2);
  assert.equal(updated.checklist?.[0]?.text, "inside worktree");
  assert.equal(updated.checklist?.[1]?.status, "in_progress");
});
