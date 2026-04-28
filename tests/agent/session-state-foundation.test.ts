import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { SessionStore, createMessage } from "../../src/agent/session.js";
import { ensureBoundSession } from "../../src/host/session.js";
import { createTempWorkspace } from "../helpers.js";

test("session store rejects corrupted persisted snapshots instead of silently normalizing them away", async (t) => {
  const root = await createTempWorkspace("session-corrupt", t);
  const sessionsDir = path.join(root, "sessions");
  const store = new SessionStore(sessionsDir);
  const corruptedId = "session-corrupt";

  await fs.mkdir(sessionsDir, { recursive: true });
  await fs.writeFile(
    path.join(sessionsDir, `${corruptedId}.json`),
    `${JSON.stringify({
      schemaVersion: 1,
      id: corruptedId,
      createdAt: "2026-04-12T00:00:00.000Z",
      updatedAt: "2026-04-12T00:00:00.000Z",
      cwd: root,
      messageCount: 1,
      messages: "not-an-array",
    }, null, 2)}\n`,
    "utf8",
  );

  await assert.rejects(
    () => store.load(corruptedId),
    (error: unknown) => {
      const message = String((error as Error).message ?? error);
      assert.match(message, /session/i);
      assert.match(message, /corrupt|invalid/i);
      assert.match(message, /session-corrupt\.json/i);
      return true;
    },
  );
});

test("session store rejects snapshots without schemaVersion instead of upgrading them", async (t) => {
  const root = await createTempWorkspace("session-missing-schema", t);
  const sessionsDir = path.join(root, "sessions");
  const store = new SessionStore(sessionsDir);
  const sessionId = "session-missing-schema";
  const timestamp = "2026-04-12T00:00:00.000Z";

  await fs.mkdir(sessionsDir, { recursive: true });
  await fs.writeFile(
    path.join(sessionsDir, `${sessionId}.json`),
    `${JSON.stringify({
      id: sessionId,
      createdAt: timestamp,
      updatedAt: timestamp,
      cwd: root,
      messageCount: 1,
      messages: [
        createMessage("user", "Missing schemaVersion must not be guessed."),
      ],
    }, null, 2)}\n`,
    "utf8",
  );

  await assert.rejects(
    () => store.load(sessionId),
    /schema.?version/i,
  );
});

test("session store rejects unrecognized snapshot fields instead of sweeping them", async (t) => {
  const root = await createTempWorkspace("session-unknown-field", t);
  const sessionsDir = path.join(root, "sessions");
  const store = new SessionStore(sessionsDir);
  const sessionId = "session-unknown-field";

  await fs.mkdir(sessionsDir, { recursive: true });
  await fs.writeFile(
    path.join(sessionsDir, `${sessionId}.json`),
    `${JSON.stringify({
      schemaVersion: 1,
      id: sessionId,
      createdAt: "2026-04-12T00:00:00.000Z",
      updatedAt: "2026-04-12T00:00:00.000Z",
      cwd: root,
      messageCount: 1,
      messages: [
        createMessage("user", "Unknown fields must not be normalized away."),
      ],
      crossTurnMemory: {
        summary: "must not enter the runtime path",
      },
    }, null, 2)}\n`,
    "utf8",
  );

  await assert.rejects(
    () => store.load(sessionId),
    /unrecognized field.*crossTurnMemory/i,
  );
});

test("session store fails closed on unsupported session schema versions", async (t) => {
  const root = await createTempWorkspace("session-schema", t);
  const sessionsDir = path.join(root, "sessions");
  const store = new SessionStore(sessionsDir);
  const sessionId = "session-schema";

  await fs.mkdir(sessionsDir, { recursive: true });
  await fs.writeFile(
    path.join(sessionsDir, `${sessionId}.json`),
    `${JSON.stringify({
      schemaVersion: 999,
      id: sessionId,
      createdAt: "2026-04-12T00:00:00.000Z",
      updatedAt: "2026-04-12T00:00:00.000Z",
      cwd: root,
      messageCount: 0,
      messages: [],
    }, null, 2)}\n`,
    "utf8",
  );

  await assert.rejects(
    () => store.load(sessionId),
    (error: unknown) => {
      const message = String((error as Error).message ?? error);
      assert.match(message, /schema.?version/i);
      assert.match(message, /session-schema\.json/i);
      return true;
    },
  );
});

test("host binding refuses to recreate a corrupted bound session and keeps the broken formal id visible", async (t) => {
  const root = await createTempWorkspace("host-corrupt-session", t);
  const sessionsDir = path.join(root, "sessions");
  const store = new SessionStore(sessionsDir);
  let binding: {
    peerKey: string;
    sessionId: string;
    updatedAt: string;
  } | null = {
    peerKey: "telegram:private:1001",
    sessionId: "broken-session",
    updatedAt: "2026-04-12T00:00:00.000Z",
  };

  await fs.mkdir(sessionsDir, { recursive: true });
  await fs.writeFile(
    path.join(sessionsDir, "broken-session.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      id: "broken-session",
      createdAt: "2026-04-12T00:00:00.000Z",
      updatedAt: "2026-04-12T00:00:00.000Z",
      cwd: root,
      messageCount: 1,
      messages: "shadow-state",
    }, null, 2)}\n`,
    "utf8",
  );

  await assert.rejects(
    () => ensureBoundSession({
      cwd: root,
      sessionStore: store,
      loadBinding: async () => binding,
      createBinding: (session) => ({
        peerKey: "telegram:private:1001",
        sessionId: session.id,
        updatedAt: "2026-04-12T00:00:00.000Z",
      }),
      touchBinding: (currentBinding, sessionId) => ({
        ...currentBinding,
        sessionId,
        updatedAt: "2026-04-12T01:00:00.000Z",
      }),
      saveBinding: async (nextBinding) => {
        binding = nextBinding;
      },
    }),
    (error: unknown) => {
      const message = String((error as Error).message ?? error);
      assert.match(message, /corrupt|invalid/i);
      assert.match(message, /broken-session\.json/i);
      return true;
    },
  );

  const entries = await fs.readdir(sessionsDir);
  assert.deepEqual(entries.sort(), ["broken-session.json"]);
  assert.equal(binding?.sessionId, "broken-session");
});
