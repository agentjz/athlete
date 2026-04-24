import assert from "node:assert/strict";
import test from "node:test";

import { runManagedAgentTurn } from "../src/agent/turn.js";
import { createProviderRecoveryBudgetPauseTransition } from "../src/agent/runtimeTransition.js";
import { MemorySessionStore } from "../src/agent/session.js";
import type { RuntimeConfig } from "../src/types.js";
import { createTempWorkspace, createTestRuntimeConfig, initGitRepo } from "./helpers.js";

test("runManagedAgentTurn pauses when yielded slices exceed the managed slice budget", async () => {
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(process.cwd());
  let sliceCount = 0;

  const result = await runManagedAgentTurn({
    input: "budget test",
    cwd: process.cwd(),
    config: {
      ...createTestRuntimeConfig(process.cwd()),
      managedTurnMaxSlices: 1,
      managedTurnMaxElapsedMs: 60_000,
    } as RuntimeConfig,
    session,
    sessionStore,
    identity: {
      kind: "teammate",
      name: "slice-budget-test",
    },
    runSlice: async (options) => {
      sliceCount += 1;
      if (sliceCount > 2) {
        throw new Error("managed slice budget did not pause in time");
      }

      return {
        session: options.session,
        changedPaths: [],
        verificationAttempted: false,
        yielded: true,
      };
    },
  });

  assert.equal(result.paused, true);
  assert.equal(result.yielded, false);
  assert.equal(result.transition?.action, "pause");
  assert.equal(result.transition?.reason.code, "pause.managed_slice_budget_exhausted");
  assert.equal((result.transition?.reason as { slicesUsed?: number }).slicesUsed, 1);
  assert.equal((result.transition?.reason as { maxSlices?: number }).maxSlices, 1);
  assert.equal(sliceCount, 1);
});

test("runManagedAgentTurn pauses when managed slice elapsed budget is exhausted", async () => {
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(process.cwd());
  let sliceCount = 0;

  const result = await runManagedAgentTurn({
    input: "elapsed budget test",
    cwd: process.cwd(),
    config: {
      ...createTestRuntimeConfig(process.cwd()),
      managedTurnMaxSlices: 8,
      managedTurnMaxElapsedMs: 1,
    } as RuntimeConfig,
    session,
    sessionStore,
    identity: {
      kind: "teammate",
      name: "slice-elapsed-test",
    },
    runSlice: async (options) => {
      sliceCount += 1;
      if (sliceCount > 1) {
        throw new Error("managed elapsed budget did not pause in time");
      }
      await new Promise((resolve) => setTimeout(resolve, 10));

      return {
        session: options.session,
        changedPaths: [],
        verificationAttempted: false,
        yielded: true,
      };
    },
  });

  assert.equal(result.paused, true);
  assert.equal(result.yielded, false);
  assert.equal(result.transition?.action, "pause");
  assert.equal(result.transition?.reason.code, "pause.managed_slice_budget_exhausted");
  assert.equal((result.transition?.reason as { slicesUsed?: number }).slicesUsed, 1);
  assert.equal((result.transition?.reason as { maxSlices?: number }).maxSlices, 8);
  assert.equal((result.transition?.reason as { elapsedMs?: number }).elapsedMs! >= 1, true);
  assert.equal((result.transition?.reason as { maxElapsedMs?: number }).maxElapsedMs, 1);
  assert.equal(sliceCount, 1);
});

test("runManagedAgentTurn rebounds to lead orchestration when managed slice budget is exhausted", async (t) => {
  const root = await createTempWorkspace("managed-budget-lead-rebound", t);
  await initGitRepo(root);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);
  let sliceCount = 0;

  const result = await runManagedAgentTurn({
    input: "lead managed budget rebound test",
    cwd: root,
    config: {
      ...createTestRuntimeConfig(root),
      managedTurnMaxSlices: 1,
      managedTurnMaxElapsedMs: 60_000,
    } as RuntimeConfig,
    session,
    sessionStore,
    runSlice: async (options) => {
      sliceCount += 1;
      if (sliceCount === 1) {
        return {
          session: options.session,
          changedPaths: [],
          verificationAttempted: false,
          yielded: true,
        };
      }

      return {
        session: options.session,
        changedPaths: [],
        verificationAttempted: false,
        yielded: false,
      };
    },
  });

  assert.equal(sliceCount, 2);
  assert.notEqual(result.paused, true);
  assert.equal(result.yielded, false);
});

test("runManagedAgentTurn rebounds to lead orchestration after provider recovery budget pauses a slice", async (t) => {
  const root = await createTempWorkspace("managed-provider-budget-rebound", t);
  await initGitRepo(root);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);
  let sliceCount = 0;

  const result = await runManagedAgentTurn({
    input: "lead provider budget rebound test",
    cwd: root,
    config: createTestRuntimeConfig(root),
    session,
    sessionStore,
    runSlice: async (options) => {
      sliceCount += 1;
      if (sliceCount === 1) {
        const transition = createProviderRecoveryBudgetPauseTransition({
          attemptsUsed: 2,
          maxAttempts: 1,
          elapsedMs: 500,
          maxElapsedMs: 120_000,
          lastError: "socket hang up",
        });
        return {
          session: options.session,
          changedPaths: [],
          verificationAttempted: false,
          yielded: false,
          paused: true,
          pauseReason: transition.reason.pauseReason,
          transition,
        };
      }

      return {
        session: options.session,
        changedPaths: [],
        verificationAttempted: false,
        yielded: false,
      };
    },
  });

  assert.equal(sliceCount, 2);
  assert.notEqual(result.paused, true);
  assert.equal(result.yielded, false);
});
