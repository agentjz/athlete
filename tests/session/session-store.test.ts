import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { SessionStore } from "../../src/session/store.js";
import { createTempWorkspace } from "../helpers.js";

test("session store persists and reloads session snapshots", async (t) => {
  const root = await createTempWorkspace("session-store", t);
  const store = new SessionStore(path.join(root, ".kitty", "sessions"));
  const session = await store.create(root);
  await store.save(session);

  const loaded = await store.load(session.id);
  assert.equal(loaded.id, session.id);
  assert.equal(loaded.cwd, root);

  const latest = await store.loadLatest();
  assert.equal(latest?.id, session.id);
});
