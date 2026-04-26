import assert from "node:assert/strict";
import test from "node:test";

import { MemorySessionStore } from "../src/agent/session.js";
import { prepareLeadTurn } from "../src/orchestrator/prepareLeadTurn.js";
import type { OrchestratorDecision } from "../src/orchestrator/types.js";
import { createTempWorkspace, createTestRuntimeConfig } from "./helpers.js";

test("F01: keyword-only investigation wording does not auto-trigger subagent delegation", async (t) => {
  const root = await createTempWorkspace("delegation-trigger-f01", t);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);

  const decision = await decide(root, sessionStore, session, "Analyze this quickly.");
  assert.equal(
    decision.action,
    "self_execute",
    "keyword-only wording should stay on lead execution",
  );
});

test("F02: keyword-only parallel wording does not auto-trigger teammate delegation", async (t) => {
  const root = await createTempWorkspace("delegation-trigger-f02", t);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);

  const decision = await decide(root, sessionStore, session, "Parallel this with a teammate.");
  assert.equal(
    decision.action,
    "self_execute",
    "keyword-only parallel wording should not dispatch teammate lanes directly",
  );
});

test("explicit @subagent prefix reaches routing and may launch the subagent lane", async (t) => {
  const root = await createTempWorkspace("delegation-trigger-explicit-subagent", t);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);

  const decision = await decide(root, sessionStore, session, "@subagent Inspect the runtime closeout path and report evidence.");

  assert.equal(decision.action, "delegate_subagent");
});

test("explicit @team prefix opens the lane but leaves teammate configuration to the lead", async (t) => {
  const root = await createTempWorkspace("delegation-trigger-explicit-team", t);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);

  const prepared = await prepareLeadTurn({
    input: "@team 请派一个队友浏览一个中文网页并向我报告。",
    cwd: root,
    config: createTestRuntimeConfig(root),
    session,
    sessionStore,
    deps: {
      spawnExecutionWorker: () => 9999,
    },
  });

  assert.equal(prepared.decision.action, "self_execute");
  assert.match(prepared.decision.reason, /lead must decide teammate name, role, assignment/i);
});

async function decide(
  root: string,
  sessionStore: MemorySessionStore,
  session: Awaited<ReturnType<MemorySessionStore["create"]>>,
  input: string,
): Promise<OrchestratorDecision> {
  const prepared = await prepareLeadTurn({
    input,
    cwd: root,
    config: createTestRuntimeConfig(root),
    session,
    sessionStore,
    deps: {
      spawnExecutionWorker: () => 9999,
    },
  });
  return prepared.decision;
}
