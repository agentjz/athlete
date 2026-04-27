import assert from "node:assert/strict";
import test from "node:test";

import { analyzeOrchestratorInput } from "../../src/orchestrator/analyze.js";

test("analyzeOrchestratorInput does not infer delegation intent from plain keywords", async (t) => {
  t.diagnostic("No runtime session store is required for pure analysis tests.");
  const session = {
    messages: [],
    taskState: undefined,
  } as any;

  const analysis = analyzeOrchestratorInput({
    input: "Please investigate this in parallel with a teammate.",
    session,
  });

  assert.equal(analysis.wantsSubagent, false);
  assert.equal(analysis.wantsTeammate, false);
});

test("analyzeOrchestratorInput does not carry an old runtime lane into a new plain objective", async (t) => {
  t.diagnostic("A fresh user objective without a runtime lane must reset the previous lane authorization.");
  const session = {
    messages: [],
    taskState: {
      objective: "old delegated objective",
      delegationDirective: {
        teammate: false,
        subagent: true,
        source: "model_decision",
      },
    },
  } as any;

  const fresh = analyzeOrchestratorInput({
    input: "New objective: inspect the runtime path and summarize the result.",
    session,
  });

  assert.equal(fresh.wantsSubagent, false);
  assert.equal(fresh.wantsTeammate, false);
  assert.equal(fresh.delegationDirective?.source, "none");

  const continuation = analyzeOrchestratorInput({
    input: "continue",
    session,
  });
  assert.equal(continuation.wantsSubagent, true);
  assert.equal(continuation.delegationDirective?.source, "model_decision");
});

test("analyzeOrchestratorInput accepts explicit background command syntax only", async (t) => {
  t.diagnostic("No runtime session store is required for pure analysis tests.");
  const session = {
    messages: [],
    taskState: undefined,
  } as any;

  const explicit = analyzeOrchestratorInput({
    input: "background: npm test -- --watch=false",
    session,
  });
  assert.equal(explicit.wantsBackground, true);
  assert.equal(explicit.backgroundCommand, "npm test -- --watch=false");

  const keywordOnly = analyzeOrchestratorInput({
    input: "Run this in background `npm test -- --watch=false`",
    session,
  });
  assert.equal(keywordOnly.wantsBackground, false);
  assert.equal(keywordOnly.backgroundCommand, undefined);
});
