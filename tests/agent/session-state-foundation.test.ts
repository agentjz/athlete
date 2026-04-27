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

test("session store upgrades versionless snapshots onto the formal schema and preserves machine state", async (t) => {
  const root = await createTempWorkspace("session-upgrade", t);
  const sessionsDir = path.join(root, "sessions");
  const store = new SessionStore(sessionsDir);
  const sessionId = "session-upgrade";
  const timestamp = "2026-04-12T00:00:00.000Z";

  await fs.mkdir(sessionsDir, { recursive: true });
  await fs.writeFile(
    path.join(sessionsDir, `${sessionId}.json`),
    `${JSON.stringify({
      id: sessionId,
      createdAt: timestamp,
      updatedAt: timestamp,
      cwd: root,
      title: "Legacy session snapshot",
      messageCount: 1,
      messages: [
        createMessage("user", "Keep the durable state intact."),
      ],
      taskState: {
        objective: "Keep the durable state intact.",
        activeFiles: ["src/agent/session/store.ts"],
        plannedActions: ["Harden the session snapshot boundary"],
        completedActions: ["Reviewed the current truth sources"],
        blockers: ["Need a formal schema version"],
        lastUpdatedAt: timestamp,
      },
      checkpoint: {
        version: 1,
        objective: "Keep the durable state intact.",
        status: "active",
        completedSteps: ["Reviewed the current truth sources"],
        currentStep: "Upgrade the session snapshot.",
        nextStep: "Reload it without losing machine state.",
        flow: {
          phase: "continuation",
          updatedAt: timestamp,
        },
        priorityArtifacts: [],
        updatedAt: timestamp,
      },
      verificationState: {
        status: "required",
        attempts: 1,
        reminderCount: 1,
        noProgressCount: 0,
        maxAttempts: 3,
        maxNoProgress: 2,
        maxReminders: 3,
        pendingPaths: ["src/agent/session/store.ts"],
        updatedAt: timestamp,
      },
      acceptanceState: {
        status: "active",
        contract: {
          kind: "product",
          requiredFiles: [{ path: "README.md" }],
          commandChecks: [],
          httpChecks: [],
        },
        currentPhase: "build_product",
        stalledPhaseCount: 1,
        completedChecks: ["file:README.md"],
        pendingChecks: ["command:smoke"],
        lastIssueSummary: "README exists, but smoke verification is still pending.",
        updatedAt: timestamp,
      },
      runtimeStats: {
        version: 1,
        model: {
          requestCount: 2,
          waitDurationMsTotal: 320,
          usage: {
            requestsWithUsage: 0,
            requestsWithoutUsage: 2,
            inputTokensTotal: 0,
            outputTokensTotal: 0,
            totalTokensTotal: 0,
            reasoningTokensTotal: 0,
          },
        },
        tools: {
          callCount: 1,
          durationMsTotal: 120,
          byName: {},
        },
        events: {
          continuationCount: 1,
          yieldCount: 0,
          recoveryCount: 0,
          compressionCount: 0,
        },
        externalizedToolResults: {
          count: 0,
          byteLengthTotal: 0,
        },
        updatedAt: timestamp,
      },
    }, null, 2)}\n`,
    "utf8",
  );

  const loaded = await store.load(sessionId);
  const rewritten = JSON.parse(await fs.readFile(path.join(sessionsDir, `${sessionId}.json`), "utf8")) as Record<string, unknown>;

  assert.equal(loaded.taskState?.objective, "Keep the durable state intact.");
  assert.equal(loaded.checkpoint?.currentStep, "Upgrade the session snapshot.");
  assert.equal(loaded.verificationState?.status, "required");
  assert.equal(loaded.acceptanceState?.currentPhase, "build_product");
  assert.equal(loaded.runtimeStats?.model.requestCount, 2);
  assert.equal(rewritten.schemaVersion, 1);
  assert.equal((rewritten.runtimeStats as { version?: unknown })?.version, 1);
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
