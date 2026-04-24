import assert from "node:assert/strict";
import test from "node:test";

import { getDelegationModeProfile, normalizeDelegationMode } from "../src/orchestrator/delegation/mode.js";
import { applyDelegationPolicyGate } from "../src/orchestrator/delegation/policyGate.js";

test("default mode resolves to balanced", () => {
  assert.equal(normalizeDelegationMode(undefined), "balanced");
  assert.equal(normalizeDelegationMode(""), "balanced");
  assert.equal(normalizeDelegationMode("unknown-mode"), "balanced");
});

test("mode profile maps to expected budget defaults", () => {
  const fast = getDelegationModeProfile("fast");
  const balanced = getDelegationModeProfile("balanced");
  const deep = getDelegationModeProfile("deep");

  assert.deepEqual(fast.subagentBudget, {
    maxToolCalls: 4,
    maxModelTurns: 3,
    maxElapsedMs: 120_000,
  });
  assert.deepEqual(balanced.subagentBudget, {
    maxToolCalls: 10,
    maxModelTurns: 8,
    maxElapsedMs: 360_000,
  });
  assert.deepEqual(deep.subagentBudget, {
    maxToolCalls: 20,
    maxModelTurns: 16,
    maxElapsedMs: 900_000,
  });
});

test("F09: mode thresholds are advisory and do not hard-block delegation", () => {
  const fastOutcome = applyDelegationPolicyGate({
    decisionAction: "delegate_subagent",
    evaluation: {
      action: "delegate_subagent",
      necessary: true,
      score: 0.5,
      confidence: "medium",
      reasons: ["Task has moderate uncertainty."],
      hardSignalCount: 1,
      intentSignalCount: 1,
    },
    mode: getDelegationModeProfile("fast"),
    activeDelegationCount: 0,
    returnBarrierPending: false,
  });
  const deepOutcome = applyDelegationPolicyGate({
    decisionAction: "delegate_subagent",
    evaluation: {
      action: "delegate_subagent",
      necessary: true,
      score: 0.5,
      confidence: "medium",
      reasons: ["Task has moderate uncertainty."],
      hardSignalCount: 1,
      intentSignalCount: 1,
    },
    mode: getDelegationModeProfile("deep"),
    activeDelegationCount: 0,
    returnBarrierPending: false,
  });

  assert.equal(fastOutcome.allow, true);
  assert.equal(fastOutcome.reasonCode, "policy.allow_advisory_only");
  assert.equal(deepOutcome.allow, true);
  assert.equal(deepOutcome.reasonCode, "policy.allow");
});
