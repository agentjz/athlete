import assert from "node:assert/strict";
import test from "node:test";

import { MemorySessionStore } from "../../src/agent/session.js";
import { prepareLeadTurn } from "../../src/orchestrator/prepareLeadTurn.js";
import type { OrchestratorDecision } from "../../src/orchestrator/types.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";

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

test("runtime subagent lane alone does not launch the subagent lane", async (t) => {
  const root = await createTempWorkspace("delegation-trigger-runtime-subagent", t);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);

  const decision = await decide(root, sessionStore, session, "Inspect the runtime closeout path and report evidence.", "subagent");

  assert.equal(decision.action, "self_execute");
});

test("runtime team lane alone does not create a teammate", async (t) => {
  const root = await createTempWorkspace("delegation-trigger-runtime-team", t);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);

  const prepared = await prepareLeadTurn({
    input: "Please ask a teammate to inspect a webpage and report back.",
    cwd: root,
    config: { ...createTestRuntimeConfig(root), agentLane: "team" },
    session,
    sessionStore,
    deps: {
      spawnExecutionWorker: () => 9999,
    },
  });

  assert.equal(prepared.decision.action, "self_execute");
  assert.doesNotMatch(prepared.decision.reason, /opened the team lane/i);
});

async function decide(
  root: string,
  sessionStore: MemorySessionStore,
  session: Awaited<ReturnType<MemorySessionStore["create"]>>,
  input: string,
  agentLane: "lead" | "team" | "subagent" | "allpeople" = "lead",
): Promise<OrchestratorDecision> {
  const prepared = await prepareLeadTurn({
    input,
    cwd: root,
    config: { ...createTestRuntimeConfig(root), agentLane },
    session,
    sessionStore,
    deps: {
      spawnExecutionWorker: () => 9999,
    },
  });
  return prepared.decision;
}
