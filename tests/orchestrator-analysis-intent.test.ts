import assert from "node:assert/strict";
import test from "node:test";

import { analyzeOrchestratorInput } from "../src/orchestrator/analyze.js";

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

  assert.equal(analysis.needsInvestigation, false);
  assert.equal(analysis.prefersParallel, false);
  assert.equal(analysis.wantsSubagent, false);
  assert.equal(analysis.wantsTeammate, false);
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
