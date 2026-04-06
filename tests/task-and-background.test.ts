import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { BackgroundJobStore } from "../src/background/store.js";
import { TaskStore } from "../src/tasks/store.js";
import { createTempWorkspace } from "./helpers.js";

test("TaskStore persists dependency graphs and unblocks dependents", async (t) => {
  const root = await createTempWorkspace("tasks", t);
  const store = new TaskStore(root);

  const task1 = await store.create("task 1");
  const task2 = await store.create("task 2");
  await store.update(task2.id, { addBlockedBy: [task1.id] });

  const blocked = await store.load(task2.id);
  assert.deepEqual(blocked.blockedBy, [task1.id]);
  assert.deepEqual((await store.listClaimable()).map((task) => task.id), [task1.id]);

  await store.update(task1.id, { status: "completed" });
  const unblocked = await store.load(task2.id);
  assert.deepEqual(unblocked.blockedBy, []);
  assert.deepEqual((await store.listClaimable()).map((task) => task.id), [task2.id]);
});

test("TaskStore auto-closes checklist items when a task is completed", async (t) => {
  const root = await createTempWorkspace("task-closeout", t);
  const store = new TaskStore(root);

  const task = await store.create("task closeout");
  await store.setChecklist(task.id, [
    { id: "1", text: "first", status: "completed" },
    { id: "2", text: "second", status: "in_progress" },
    { id: "3", text: "third", status: "pending" },
  ]);

  await store.update(task.id, { status: "completed" });
  const completed = await store.load(task.id);

  assert.equal(completed.status, "completed");
  assert.deepEqual(
    completed.checklist?.map((item) => item.status),
    ["completed", "completed", "completed"],
  );
});

test("BackgroundJobStore filters jobs by cwd and requester", async (t) => {
  const root = await createTempWorkspace("background", t);
  const store = new BackgroundJobStore(root);
  const childDir = path.join(root, "pkg-a");

  const job1 = await store.create({
    command: "npm test",
    cwd: root,
    requestedBy: "lead",
    timeoutMs: 10_000,
  });
  const job2 = await store.create({
    command: "pytest -q",
    cwd: childDir,
    requestedBy: "alpha",
    timeoutMs: 10_000,
  });
  await store.complete(job1.id, { status: "completed", exitCode: 0, output: "ok" });
  await store.complete(job2.id, { status: "failed", exitCode: 1, output: "boom" });

  const alphaRelevant = await store.listRelevant({ cwd: childDir, requestedBy: "alpha" });
  assert.deepEqual(alphaRelevant.map((job) => job.id), [job2.id]);

  const leadSummary = await store.summarize({ cwd: root, requestedBy: "lead" });
  assert.match(leadSummary, new RegExp(job1.id));
  assert.doesNotMatch(leadSummary, new RegExp(job2.id));
});
