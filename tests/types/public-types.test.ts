import assert from "node:assert/strict";
import test from "node:test";

import type {
  RuntimeConfig,
  RuntimeTransition,
  SessionRecord,
  ToolExecutionResult,
} from "../../src/types.js";

test("public type barrel exposes runtime, session, transition, and tool result contracts", () => {
  const config = {
    schemaVersion: 1,
    provider: "openai",
    apiKey: "test",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.5",
    profile: "intp",
    thinking: "enabled",
    contextWindowMessages: 120,
    maxContextChars: 900_000,
    contextSummaryChars: 120_000,
    maxReadBytes: 120_000,
    commandStallTimeoutMs: 30_000,
    showReasoning: true,
    telegram: {
      token: "",
      apiBaseUrl: "https://api.telegram.org",
      proxyUrl: "",
      allowedUserIds: [],
      polling: { timeoutSeconds: 10, limit: 10, retryBackoffMs: 1_000 },
      delivery: { maxRetries: 4, baseDelayMs: 250, maxDelayMs: 10_000 },
      messageChunkChars: 3_500,
      typingIntervalMs: 4_000,
      stateDir: ".kitty/telegram",
    },
    extensions: {
      todo: true,
      worktree: false,
      network: false,
      spec: false,
    },
    paths: {
      configDir: ".kitty",
      dataDir: ".kitty",
      cacheDir: ".kitty/cache",
      configFile: ".kitty/config.json",
      sessionsDir: ".kitty/sessions",
      changesDir: ".kitty/changes",
    },
  } satisfies RuntimeConfig;

  const session = {
    id: "session-public-type",
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z",
    cwd: ".",
    messageCount: 0,
    messages: [],
  } satisfies SessionRecord;

  const transition = {
    action: "finalize",
    reason: {
      code: "finalize.completed",
      changedPaths: [],
    },
    timestamp: "2026-05-20T00:00:00.000Z",
  } satisfies RuntimeTransition;

  const result = {
    ok: true,
    output: "{}",
  } satisfies ToolExecutionResult;

  assert.equal(session.id, "session-public-type");
  assert.equal(config.model, "gpt-5.5");
  assert.equal(transition.action, "finalize");
  assert.equal(result.ok, true);
});
