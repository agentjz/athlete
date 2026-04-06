import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { MemorySessionStore } from "../src/agent/sessionStore.js";
import { prepareLeadTurn } from "../src/orchestrator/prepareLeadTurn.js";
import { TaskStore } from "../src/tasks/store.js";
import { createTempWorkspace, createTestRuntimeConfig, initGitRepo } from "./helpers.js";

test("prepareLeadTurn persists orchestration state only through existing truth sources", async (t) => {
  const root = await createTempWorkspace("orchestrator-truth", t);
  await initGitRepo(root);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);

  const prepared = await prepareLeadTurn({
    input: "Refactor the CLI flow, split the work, and keep the runtime stable.",
    cwd: root,
    config: createTestRuntimeConfig(root),
    session,
    sessionStore,
  });

  const athleteDirEntries = await fs.readdir(path.join(root, ".athlete"));
  const tasks = await new TaskStore(root).list();

  assert.ok(tasks.length >= 2);
  assert.equal(athleteDirEntries.includes("orchestrator"), false);
  assert.equal(prepared.session.messages.some((message) => String(message.content ?? "").includes("Orchestrator")), true);
});
