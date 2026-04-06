import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { TaskStore } from "../src/tasks/store.js";
import { claimTaskTool } from "../src/tools/tasks/claimTaskTool.js";
import { WorktreeStore } from "../src/worktrees/store.js";
import { createTempWorkspace, initGitRepo, makeToolContext } from "./helpers.js";

test("claim_task creates or binds an isolated worktree and remove completes the task", async (t) => {
  const root = await createTempWorkspace("worktree", t);
  await initGitRepo(root);

  const taskStore = new TaskStore(root);
  const task = await taskStore.create("auth refactor", "", { assignee: "alpha" });

  const claim = await claimTaskTool.execute(
    JSON.stringify({ task_id: task.id }),
    makeToolContext(root, root, {
      identity: { kind: "teammate", name: "alpha", role: "writer", teamName: "default" },
    }) as any,
  );

  assert.equal(claim.ok, true);
  assert.match(claim.output, /auth-refactor|worktree/i);

  const claimedTask = await taskStore.load(task.id);
  assert.equal(claimedTask.owner, "alpha");
  assert.equal(claimedTask.status, "in_progress");
  assert.ok(claimedTask.worktree);

  const worktreeStore = new WorktreeStore(root);
  const worktree = await worktreeStore.get(claimedTask.worktree);
  await fs.writeFile(path.join(worktree.path, "note.txt"), "done\n", "utf8");

  await worktreeStore.remove(worktree.name, { force: true, completeTask: true });

  const finishedTask = await taskStore.load(task.id);
  assert.equal(finishedTask.status, "completed");
  assert.equal(finishedTask.worktree, "");

  const indexEntry = await worktreeStore.find(worktree.name);
  assert.equal(indexEntry?.status, "removed");
});
