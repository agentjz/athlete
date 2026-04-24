import assert from "node:assert/strict";
import test from "node:test";

import { MemorySessionStore } from "../src/agent/session.js";
import { runLeadOrchestrationLoop } from "../src/orchestrator/leadLoop.js";
import type { OrchestratorDecision } from "../src/orchestrator/types.js";
import {
  applyOrchestratorReturnBarrier,
  clearOrchestratorReturnBarrier,
  markOrchestratorReturnBarrierPending,
  readOrchestratorReturnBarrierState,
} from "../src/orchestrator/returnBarrier.js";
import { createTempWorkspace, createTestRuntimeConfig } from "./helpers.js";

test("F07: pending return barrier blocks continuous delegation in one chain", async () => {
  const sessionStore = new MemorySessionStore();
  const initial = await sessionStore.create(process.cwd());
  const marked = markOrchestratorReturnBarrierPending(initial, {
    action: "delegate_subagent",
    taskId: 3,
  });

  const nextDecision: OrchestratorDecision = {
    action: "delegate_teammate",
    reason: "follow-up delegation",
  };
  const applied = applyOrchestratorReturnBarrier(marked, nextDecision);

  assert.equal(applied.decision.action, "self_execute");
  assert.equal(applied.enforced, true);
  assert.match(applied.decision.reason, /return barrier/i);
});

test("self-execute on lead review clears pending return barrier", async () => {
  const sessionStore = new MemorySessionStore();
  const initial = await sessionStore.create(process.cwd());
  const marked = markOrchestratorReturnBarrierPending(initial, {
    action: "delegate_teammate",
    taskId: 9,
  });
  const applied = applyOrchestratorReturnBarrier(marked, {
    action: "self_execute",
    reason: "lead review stage",
  });

  assert.equal(applied.enforced, false);
  const state = readOrchestratorReturnBarrierState(applied.session);
  assert.equal(state.pending, false);
});

test("clear helper resets return barrier state to non-pending", async () => {
  const sessionStore = new MemorySessionStore();
  const initial = await sessionStore.create(process.cwd());
  const marked = markOrchestratorReturnBarrierPending(initial, {
    action: "delegate_subagent",
    taskId: 1,
  });
  const cleared = clearOrchestratorReturnBarrier(marked);

  const state = readOrchestratorReturnBarrierState(cleared);
  assert.equal(state.pending, false);
});

test("lead orchestration no longer auto-dispatches multiple delegations in one chain", async (t) => {
  const root = await createTempWorkspace("return-barrier-integration", t);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);
  let subagentCalls = 0;
  let spawnCount = 0;

  const outcome = await runLeadOrchestrationLoop({
    input: "Delegate a subagent to survey the codebase, then run implementation in parallel with a teammate and merge.",
    cwd: root,
    config: createTestRuntimeConfig(root),
    session,
    sessionStore,
    deps: {
      runSubagentTask: async () => ({
        executionId: `exec-subagent-${++subagentCalls}`,
        content: "survey complete",
      }),
      spawnExecutionWorker: () => {
        spawnCount += 1;
        return 5000 + spawnCount;
      },
    },
  });

  assert.equal(outcome.kind, "run_lead");
  assert.equal(subagentCalls, 0);
  assert.equal(spawnCount, 0);
  if (outcome.kind === "run_lead") {
    assert.match(outcome.input, /Stage:\s*survey/i);
    assert.match(outcome.input, /may fit a subagent/i);
  }
});
