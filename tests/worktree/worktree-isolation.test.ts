import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { TaskStore } from "../../src/tasks/store.js";
import { claimTaskTool } from "../../src/tools/tasks/claimTaskTool.js";
import { WorktreeStore } from "../../src/worktrees/store.js";
import { createTempWorkspace, initGitRepo, makeToolContext } from "../helpers.js";

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

test("claim_task fails closed instead of leaving a teammate task half-claimed when no worktree can be created", async (t) => {
  const root = await createTempWorkspace("worktree-fail-closed", t);
  const taskStore = new TaskStore(root);
  const task = await taskStore.create("auth refactor", "", { assignee: "alpha" });

  await assert.rejects(
    () =>
      claimTaskTool.execute(
        JSON.stringify({ task_id: task.id }),
        makeToolContext(root, root, {
          identity: { kind: "teammate", name: "alpha", role: "writer", teamName: "default" },
        }) as any,
      ),
    /worktree/i,
  );

  const reloaded = await taskStore.load(task.id);
  assert.equal(reloaded.status, "pending");
  assert.equal(reloaded.owner, "");
  assert.equal(reloaded.worktree, "");
});

test("create prunes missing git worktree registrations before reusing the path", async (t) => {
  const root = await createTempWorkspace("worktree-prune", t);
  await initGitRepo(root);

  const worktreeStore = new WorktreeStore(root);
  const first = await worktreeStore.create("implement");
  await fs.rm(first.path, { recursive: true, force: true });

  const staleList = execFileSync("git", ["worktree", "list", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.match(staleList, /prunable gitdir file points to non-existent location/);

  const second = await worktreeStore.create("implement");

  assert.equal(second.name, "implement");
  assert.equal(second.status, "active");
  assert.equal(await pathExists(second.path), true);
});

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
