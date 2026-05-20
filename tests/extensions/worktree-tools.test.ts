import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createDefaultAgentToolRegistry } from "../../src/tools/registry.js";
import { createTempWorkspace, createToolContext, parseToolJson } from "../helpers.js";

test("worktree extension exposes git worktree facts and lifecycle events", async (t) => {
  const root = await createTempWorkspace("worktree-extension", t);
  const context = createToolContext(root);
  context.config.extensions.worktree = true;
  const registry = await createDefaultAgentToolRegistry(context.config);

  const list = await registry.execute("worktree_list", "{}", context);
  assert.equal(list.ok, true);
  assert.equal(Array.isArray(parseToolJson(list.output).worktrees), true);

  const get = await registry.execute("worktree_get", JSON.stringify({
    path: root,
  }), context);
  assert.equal(get.ok, true);
  assert.equal((parseToolJson(get.output).worktree as Record<string, unknown>).path, root);

  const keep = await registry.execute("worktree_keep", JSON.stringify({
    path: root,
    kept: true,
  }), context);
  assert.equal(keep.ok, true);
  assert.equal(keep.metadata?.changedPaths?.length, 1);

  const events = await registry.execute("worktree_events", JSON.stringify({
    limit: 10,
  }), context);
  assert.equal(events.ok, true);
  const eventRecords = parseToolJson(events.output).events as Array<Record<string, unknown>>;
  assert.equal(Array.isArray(eventRecords), true);
  assert.equal(eventRecords.at(-1)?.event, "keep");
});

test("worktree create and remove report the lifecycle state file they update", async (t) => {
  const root = await createTempWorkspace("worktree-lifecycle", t);
  await fs.writeFile(path.join(root, "README.md"), "# test\n", "utf8");
  await runGit(root, ["init"]);
  await runGit(root, ["config", "user.email", "kitty@example.test"]);
  await runGit(root, ["config", "user.name", "Kitty Test"]);
  await runGit(root, ["add", "README.md"]);
  await runGit(root, ["commit", "-m", "initial"]);

  const context = createToolContext(root);
  context.config.extensions.worktree = true;
  const registry = await createDefaultAgentToolRegistry(context.config);
  const worktreePath = path.join(await createTempWorkspace("worktree-target-parent", t), "feature");

  const created = await registry.execute("worktree_create", JSON.stringify({
    path: worktreePath,
    branch: "feature/test",
    create_branch: true,
  }), context);
  assert.equal(created.ok, true);
  assert.equal(created.metadata?.changedPaths?.length, 1);

  const removed = await registry.execute("worktree_remove", JSON.stringify({
    path: worktreePath,
    force: true,
  }), context);
  assert.equal(removed.ok, true);
  assert.equal(removed.metadata?.changedPaths?.length, 1);
});

async function runGit(cwd: string, args: string[]): Promise<void> {
  const { execa } = await import("execa");
  const result = await execa("git", args, {
    cwd,
    all: true,
    reject: false,
    windowsHide: true,
  });
  assert.equal(result.exitCode, 0, result.all);
}
