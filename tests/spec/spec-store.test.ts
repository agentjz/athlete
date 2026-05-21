import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { getProjectStatePaths } from "../../src/project/statePaths.js";
import { getSpecPaths, getSpecRootDir } from "../../src/spec/layout.js";
import { SpecStore } from "../../src/spec/store.js";
import { createTempWorkspace, initGitRepo } from "../helpers.js";

test("spec store persists documents, state, session binding, and checkpoints", async (t) => {
  const root = await createTempWorkspace("spec-store", t);
  await initGitRepo(root);
  const store = new SpecStore(root, { rootDir: root });

  const created = await store.create({
    title: "Web Shell",
    summary: "Local developer web shell.",
    sessionId: "session-a",
  });
  assert.equal(created.stage, "requirements");
  assert.equal(created.status, "active");
  assert.deepEqual(created.sessionIds, ["session-a"]);
  assert.ok(created.workspace?.path);
  assert.match(created.workspace?.branch ?? "", /^spec\//);
  assert.match(await store.readDocument(created.id, "requirements"), /^# Requirements/);
  assert.match(await store.readDocument(created.id, "requirements"), /## Success Criteria/);
  assert.match(await store.readDocument(created.id, "design"), /^# Design/);
  assert.match(await store.readDocument(created.id, "tasks"), /Confirm requirements/);
  assert.match(await store.readDocument(created.id, "notes"), /factual interview notes/);

  const requirements = "# Requirements\n\n- Confirm local developer user.\n";
  await store.writeDocument(created.id, "requirements", requirements);
  await fs.writeFile(path.join(created.workspace!.path, "feature.txt"), "before\n", "utf8");
  const updated = await store.updateState(created.id, {
    stage: "design",
    confirmed: { requirements: true },
    sessionId: "session-b",
  });

  assert.equal(updated.confirmed.requirements, true);
  assert.equal(updated.stage, "design");
  assert.deepEqual(updated.sessionIds, ["session-a", "session-b"]);
  assert.equal(await store.readDocument(created.id, "requirements"), requirements);

  const checkpoint = await store.createCheckpoint(created.id, {
    label: "requirements confirmed",
    reason: "User accepted requirements.",
  });
  await store.writeDocument(created.id, "requirements", "# Mutated\n");
  await fs.writeFile(path.join(created.workspace!.path, "feature.txt"), "after\n", "utf8");
  await store.createCheckpoint(created.id, {
    label: "mutated after requirements",
  });
  await store.restoreCheckpoint(created.id, checkpoint.id);

  assert.equal(await store.readDocument(created.id, "requirements"), requirements);
  assert.equal(normalizeNewlines(await fs.readFile(path.join(created.workspace!.path, "feature.txt"), "utf8")), "before\n");
  assert.equal((await store.loadSessionBinding("session-a"))?.specId, created.id);
  assert.ok((await store.listCheckpoints(created.id)).some((item) => item.id === checkpoint.id));
  assert.ok(checkpoint.workspace?.commit);
  assert.equal(getSpecPaths(root, created.id).specDir.startsWith(getSpecRootDir(root)), true);
});

test("spec search reads document evidence without injecting it automatically", async (t) => {
  const root = await createTempWorkspace("spec-search", t);
  await initGitRepo(root);
  const store = new SpecStore(root, { rootDir: root });
  const first = await store.create({ title: "Telegram Console" });
  const second = await store.create({ title: "Web Control Plane" });
  await store.writeDocument(first.id, "requirements", "机器人端的命令入口。");
  await store.writeDocument(second.id, "design", "浏览器里的本机开发者控制台。");

  const results = await store.search("浏览器 控制台");
  assert.equal(results[0]?.id, second.id);
  assert.equal(results.some((item) => item.id === first.id), false);
});

test("spec store uses .kitty/specs as durable project state", async (t) => {
  const root = await createTempWorkspace("spec-layout", t);
  await initGitRepo(root);
  const store = new SpecStore(root, { rootDir: root });
  const spec = await store.create({ title: "Durable State" });
  const stateFile = getSpecPaths(root, spec.id).stateFile;

  assert.equal(await exists(stateFile), true);
  assert.equal(getSpecRootDir(root), path.join(getProjectStatePaths(root).kittyDir, "specs"));
});

test("spec creation fails closed outside git because code checkpoints require git", async (t) => {
  const root = await createTempWorkspace("spec-no-git", t);
  const store = new SpecStore(root, { rootDir: root });

  await assert.rejects(
    () => store.create({ title: "No Git" }),
    /git repository/i,
  );
});

test("spec checkpoint restore refuses main repository or external workspace paths", async (t) => {
  const root = await createTempWorkspace("spec-restore-boundary", t);
  await initGitRepo(root);
  const store = new SpecStore(root, { rootDir: root });
  const spec = await store.create({ title: "Boundary" });
  const checkpoint = await store.createCheckpoint(spec.id, { label: "safe point" });
  const paths = getSpecPaths(root, spec.id);
  const checkpointStateFile = path.join(paths.checkpointsDir, checkpoint.id, "state.json");
  const originalState = JSON.parse(await fs.readFile(checkpointStateFile, "utf8"));

  await fs.writeFile(checkpointStateFile, `${JSON.stringify({
    ...originalState,
    workspace: {
      ...originalState.workspace,
      path: root,
    },
  }, null, 2)}\n`, "utf8");
  await assert.rejects(
    () => store.restoreCheckpoint(spec.id, checkpoint.id),
    /main repository/i,
  );

  const outside = path.join(path.dirname(root), "outside-workspace");
  await fs.writeFile(checkpointStateFile, `${JSON.stringify({
    ...originalState,
    workspace: {
      ...originalState.workspace,
      path: outside,
    },
  }, null, 2)}\n`, "utf8");
  await assert.rejects(
    () => store.restoreCheckpoint(spec.id, checkpoint.id),
    /non-spec workspace/i,
  );
});

test("spec checkpoint restore refuses dirty worktree before changing spec documents", async (t) => {
  const root = await createTempWorkspace("spec-restore-dirty-atomicity", t);
  await initGitRepo(root);
  const store = new SpecStore(root, { rootDir: root });
  const spec = await store.create({ title: "Dirty Restore" });
  const workspacePath = spec.workspace!.path;

  await store.writeDocument(spec.id, "requirements", "# Requirements\n\nbefore\n");
  await fs.writeFile(path.join(workspacePath, "feature.txt"), "before\n", "utf8");
  const checkpoint = await store.createCheckpoint(spec.id, { label: "before" });

  await store.writeDocument(spec.id, "requirements", "# Requirements\n\nafter\n");
  await fs.writeFile(path.join(workspacePath, "feature.txt"), "dirty uncheckpointed\n", "utf8");

  await assert.rejects(
    () => store.restoreCheckpoint(spec.id, checkpoint.id),
    /uncheckpointed changes/i,
  );
  assert.match(await store.readDocument(spec.id, "requirements"), /after/);
  assert.equal(
    normalizeNewlines(await fs.readFile(path.join(workspacePath, "feature.txt"), "utf8")),
    "dirty uncheckpointed\n",
  );
});

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n");
}
