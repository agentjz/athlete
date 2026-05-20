import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { ensureBoundSession, persistBoundSession } from "../../src/host/session.js";
import { SessionStore } from "../../src/session/store.js";
import { createTempWorkspace } from "../helpers.js";

test("host session binding creates and persists a session binding", async (t) => {
  const root = await createTempWorkspace("host-session", t);
  const store = new SessionStore(path.join(root, ".kitty", "sessions"));
  let binding: { sessionId: string; touched: number } | null = null;

  const created = await ensureBoundSession({
    cwd: root,
    sessionStore: store,
    loadBinding: async () => binding,
    createBinding: (session) => ({ sessionId: session.id, touched: 0 }),
    touchBinding: (current, sessionId) => ({ sessionId, touched: current.touched + 1 }),
    saveBinding: async (next) => {
      binding = next;
    },
  });

  assert.equal(created.binding.sessionId, created.session.id);

  const next = await persistBoundSession({
    binding: created.binding,
    sessionId: created.session.id,
    touchBinding: (current, sessionId) => ({ sessionId, touched: current.touched + 1 }),
    saveBinding: async (saved) => {
      binding = saved;
    },
  });
  assert.equal(next.touched, 1);
});
