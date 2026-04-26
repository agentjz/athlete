import assert from "node:assert/strict";
import test from "node:test";

import { runManagedAgentTurn } from "../src/agent/turn.js";
import { MemorySessionStore } from "../src/agent/session.js";
import { getDefaultPlaywrightMcpConfig } from "../src/mcp/playwright/config.js";
import type { RuntimeConfig } from "../src/types.js";
import { createCheckpointFixture, createTempWorkspace } from "./helpers.js";

function createConfig(): RuntimeConfig {
  return {
    schemaVersion: 1,
    provider: "deepseek",
    apiKey: "test-key",
    agentModels: {
      lead: {
        provider: "deepseek",
        apiKey: "test-key",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-flash",
      },
      teammate: {
        provider: "deepseek",
        apiKey: "test-key",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-flash",
      },
      subagent: {
        provider: "deepseek",
        apiKey: "test-key",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-flash",
      },
    },
    mineru: {
      token: "test-mineru-token",
      baseUrl: "https://mineru.net/api/v4",
      modelVersion: "vlm",
      language: "ch",
      enableTable: true,
      enableFormula: true,
      pollIntervalMs: 2_000,
      timeoutMs: 300_000,
    },
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    mode: "agent",
    yieldAfterToolSteps: 5,
    contextWindowMessages: 30,
    maxContextChars: 48_000,
    contextSummaryChars: 8_000,
    maxToolIterations: 8,
    maxContinuationBatches: 8,
    maxReadBytes: 120_000,
    maxSearchResults: 80,
    maxSpreadsheetPreviewRows: 20,
    maxSpreadsheetPreviewColumns: 12,
    commandStallTimeoutMs: 30_000,
    commandMaxRetries: 1,
    commandRetryBackoffMs: 1_500,
    showReasoning: true,
    mcp: {
      enabled: false,
      servers: [],
      playwright: getDefaultPlaywrightMcpConfig(),
    },
    telegram: {
      token: "test-telegram-token",
      apiBaseUrl: "https://api.telegram.org",
      proxyUrl: "",
      allowedUserIds: [1001],
      polling: {
        timeoutSeconds: 10,
        limit: 10,
        retryBackoffMs: 1_000,
      },
      delivery: {
        maxRetries: 4,
        baseDelayMs: 250,
        maxDelayMs: 10_000,
      },
      messageChunkChars: 3_500,
      typingIntervalMs: 4_000,
      stateDir: ".deadmouse/telegram",
    },
    paths: {
      configDir: ".",
      dataDir: ".",
      cacheDir: ".",
      configFile: "config.json",
      sessionsDir: "sessions",
      changesDir: "changes",
    },
  };
}

test("runManagedAgentTurn auto-continues yielded lead turns", async (t) => {
  const root = await createTempWorkspace("managed-turn", t);
  const sessionStore = new MemorySessionStore();
  const initialSession = await sessionStore.save({
    ...(await sessionStore.create(root)),
    checkpoint: createCheckpointFixture("Ship the round2 checkpoint runtime.", {
      completedSteps: ["Persisted the first tool batch"],
      currentStep: "Waiting for continuation",
      nextStep: "Write validation/round2-resume-summary.md without rerunning completed setup.",
      flow: {
        phase: "continuation",
      },
    }),
  } as any);
  const seenInputs: string[] = [];
  const seenYieldSteps: Array<number | undefined> = [];
  let sliceCount = 0;

  const result = await runManagedAgentTurn({
    input: "start task",
    cwd: root,
    config: createConfig(),
    session: initialSession,
    sessionStore,
    runSlice: async (options) => {
      sliceCount += 1;
      seenInputs.push(options.input);
      seenYieldSteps.push(options.yieldAfterToolSteps);

      return {
        session: {
          ...options.session,
          title: `slice-${sliceCount}`,
        },
        changedPaths: [],
        verificationAttempted: false,
        yielded: sliceCount === 1,
      };
    },
  });

  assert.equal(sliceCount, 2);
  assert.deepEqual(seenYieldSteps, [5, 5]);
  assert.equal(seenInputs[0], "start task");
  assert.match(String(seenInputs[1]), /Resume the current task/i);
  assert.doesNotMatch(String(seenInputs[1]), /Objective:/i);
  assert.doesNotMatch(String(seenInputs[1]), /Persisted the first tool batch/i);
  assert.doesNotMatch(String(seenInputs[1]), /Write validation\/round2-resume-summary\.md/i);
  assert.equal(result.yielded, false);
  assert.equal(result.session.title, "slice-2");
});

test("runManagedAgentTurn lets supervisors override continuation input", async (t) => {
  const root = await createTempWorkspace("managed-turn", t);
  const sessionStore = new MemorySessionStore();
  const initialSession = await sessionStore.create(root);
  const seenInputs: string[] = [];
  let sliceCount = 0;

  await runManagedAgentTurn({
    input: "bootstrap",
    cwd: root,
    config: createConfig(),
    session: initialSession,
    sessionStore,
    identity: {
      kind: "teammate",
      name: "alpha",
      role: "writer",
      teamName: "default",
    },
    onYield: async () => ({
      input: "[internal] New inbox updates are pending. Read and handle them, then continue the task.",
    }),
    runSlice: async (options) => {
      sliceCount += 1;
      seenInputs.push(options.input);
      return {
        session: options.session,
        changedPaths: [],
        verificationAttempted: false,
        yielded: sliceCount === 1,
      };
    },
  });

  assert.equal(sliceCount, 2);
  assert.equal(seenInputs[0], "bootstrap");
  assert.match(String(seenInputs[1]), /New inbox updates are pending/i);
});

test("runManagedAgentTurn keeps continuation behavior when Playwright MCP config is enabled", async (t) => {
  const root = await createTempWorkspace("managed-turn", t);
  const sessionStore = new MemorySessionStore();
  const initialSession = await sessionStore.create(root);
  const seenInputs: string[] = [];
  const seenHeadlessFlags: Array<boolean | undefined> = [];
  let sliceCount = 0;

  const config = {
    ...createConfig(),
    mcp: {
      enabled: true,
      servers: [],
      playwright: {
        ...getDefaultPlaywrightMcpConfig(),
        enabled: true,
        headless: false,
      },
    },
  } as RuntimeConfig;

  const result = await runManagedAgentTurn({
    input: "resume browser task",
    cwd: root,
    config,
    session: initialSession,
    sessionStore,
    runSlice: async (options) => {
      sliceCount += 1;
      seenInputs.push(options.input);
      seenHeadlessFlags.push((options.config.mcp as any).playwright?.headless);

      return {
        session: options.session,
        changedPaths: [],
        verificationAttempted: false,
        yielded: sliceCount === 1,
      };
    },
  });

  assert.equal(sliceCount, 2);
  assert.equal(result.yielded, false);
  assert.deepEqual(seenHeadlessFlags, [false, false]);
  assert.equal(seenInputs[0], "resume browser task");
  assert.match(String(seenInputs[1]), /Resume the current task/i);
});

test("runManagedAgentTurn still auto-continues yielded turns when verification state is already passed", async (t) => {
  const root = await createTempWorkspace("managed-turn", t);
  const sessionStore = new MemorySessionStore();
  const initialSession = await sessionStore.create(root);
  const session = await sessionStore.save(({
    ...initialSession,
    checkpoint: createCheckpointFixture("Resume the verified task without restarting.", {
      completedSteps: ["Finished the implementation"],
      nextStep: "Summarize the verified result instead of rerunning the implementation tools.",
      flow: {
        phase: "continuation",
      },
    }),
    verificationState: {
      ...(initialSession.verificationState ?? {
        status: "idle",
        attempts: 0,
        reminderCount: 0,
        noProgressCount: 0,
        maxAttempts: 3,
        maxNoProgress: 2,
        maxReminders: 3,
        pendingPaths: [],
        updatedAt: new Date().toISOString(),
      }),
      status: "passed",
      attempts: 1,
      reminderCount: 0,
      pendingPaths: [],
    },
  }) as any);
  const seenInputs: string[] = [];
  let sliceCount = 0;

  const result = await runManagedAgentTurn({
    input: "resume verified task",
    cwd: root,
    config: createConfig(),
    session,
    sessionStore,
    runSlice: async (options) => {
      sliceCount += 1;
      seenInputs.push(options.input);
      return {
        session: options.session,
        changedPaths: [],
        verificationAttempted: true,
        verificationPassed: true,
        yielded: sliceCount === 1,
      };
    },
  });

  assert.equal(sliceCount, 2);
  assert.equal(result.yielded, false);
  assert.equal(seenInputs[0], "resume verified task");
  assert.match(String(seenInputs[1]), /Resume the current task/i);
  assert.doesNotMatch(String(seenInputs[1]), /Objective:/i);
  assert.doesNotMatch(String(seenInputs[1]), /Finished the implementation/i);
  assert.doesNotMatch(String(seenInputs[1]), /Summarize the verified result/i);
});
