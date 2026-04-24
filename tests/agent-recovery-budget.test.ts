import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { runManagedAgentTurn } from "../src/agent/turn.js";
import { MemorySessionStore } from "../src/agent/session.js";
import type { RuntimeConfig } from "../src/types.js";
import {
  evaluateProviderRecoveryBudget,
  resolveProviderRecoveryBudget,
} from "../src/agent/recoveryBudget.js";
import { createProviderRecoveryBudgetPauseTransition } from "../src/agent/runtimeTransition.js";
import { createTestRuntimeConfig } from "./helpers.js";
import type { ToolRegistry } from "../src/tools/types.js";

test("provider recovery budget pauses when attempt count exceeds the configured ceiling", () => {
  const config = {
    ...createTestRuntimeConfig(process.cwd()),
    providerRecoveryMaxAttempts: 2,
    providerRecoveryMaxElapsedMs: 120_000,
  } as RuntimeConfig;
  const budget = resolveProviderRecoveryBudget(config);
  const decision = evaluateProviderRecoveryBudget({
    budget,
    attemptsUsed: 3,
    recoveryStartedAtMs: 0,
    nowMs: 50_000,
    lastError: new Error("socket hang up"),
  });

  assert.equal(decision.exhausted, true);
  assert.equal(decision.snapshot.attemptsUsed, 3);
  assert.equal(decision.snapshot.maxAttempts, 2);
  assert.equal(decision.snapshot.elapsedMs, 50_000);
  assert.equal(decision.snapshot.maxElapsedMs, 120_000);
  const transition = createProviderRecoveryBudgetPauseTransition(decision.snapshot, "2026-04-20T00:00:00.000Z");
  assert.equal(transition.action, "pause");
  assert.equal(transition.reason.code, "pause.provider_recovery_budget_exhausted");
  assert.equal(transition.reason.attemptsUsed, 3);
  assert.equal(transition.reason.maxAttempts, 2);
});

test("provider recovery budget pauses when elapsed recovery time exceeds the configured ceiling", () => {
  const config = {
    ...createTestRuntimeConfig(process.cwd()),
    providerRecoveryMaxAttempts: 6,
    providerRecoveryMaxElapsedMs: 10_000,
  } as RuntimeConfig;
  const budget = resolveProviderRecoveryBudget(config);
  const decision = evaluateProviderRecoveryBudget({
    budget,
    attemptsUsed: 1,
    recoveryStartedAtMs: 0,
    nowMs: 10_025,
    lastError: "temporary upstream timeout",
  });

  assert.equal(decision.exhausted, true);
  assert.equal(decision.snapshot.attemptsUsed, 1);
  assert.equal(decision.snapshot.maxAttempts, 6);
  assert.equal(decision.snapshot.elapsedMs, 10_025);
  assert.equal(decision.snapshot.maxElapsedMs, 10_000);
  const transition = createProviderRecoveryBudgetPauseTransition(decision.snapshot, "2026-04-20T00:00:00.000Z");
  assert.equal(transition.reason.code, "pause.provider_recovery_budget_exhausted");
  assert.equal(transition.reason.elapsedMs, 10_025);
  assert.equal(transition.reason.maxElapsedMs, 10_000);
  assert.equal(transition.reason.lastError, "temporary upstream timeout");
});

test("runManagedAgentTurn pauses with provider recovery budget fields after repeated recoverable request failures", async (t) => {
  const server = await startFlakyServer();
  t.after(async () => {
    await server.close();
  });

  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(process.cwd());
  const result = await runManagedAgentTurn({
    input: "recovery budget integration test",
    cwd: process.cwd(),
    config: {
      ...createTestRuntimeConfig(process.cwd()),
      baseUrl: server.baseUrl,
      providerRecoveryMaxAttempts: 1,
      providerRecoveryMaxElapsedMs: 120_000,
    } as RuntimeConfig,
    session,
    sessionStore,
    toolRegistry: createEmptyToolRegistry(),
    identity: {
      kind: "teammate",
      name: "recovery-budget-test",
    },
  });

  assert.equal(result.paused, true);
  assert.equal(result.transition?.action, "pause");
  assert.equal(result.transition?.reason.code, "pause.provider_recovery_budget_exhausted");
  assert.equal((result.transition?.reason as { attemptsUsed?: number }).attemptsUsed, 2);
  assert.equal((result.transition?.reason as { maxAttempts?: number }).maxAttempts, 1);
  assert.equal((result.transition?.reason as { maxElapsedMs?: number }).maxElapsedMs, 120_000);
  assert.equal(typeof (result.transition?.reason as { lastError?: unknown }).lastError, "string");
  assert.equal(result.session.checkpoint?.flow?.phase, "recovery");
  assert.equal(result.session.checkpoint?.flow?.lastTransition?.reason?.code, "pause.provider_recovery_budget_exhausted");
});

function createEmptyToolRegistry(): ToolRegistry {
  return {
    definitions: [],
    async execute() {
      throw new Error("No tools should execute in recovery budget tests.");
    },
  };
}

async function startFlakyServer(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/chat/completions") {
      response.writeHead(404).end();
      return;
    }

    request.socket.destroy(new Error("socket hang up"));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected an ephemeral HTTP port.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}
