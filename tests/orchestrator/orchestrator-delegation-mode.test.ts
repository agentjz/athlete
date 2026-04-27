import assert from "node:assert/strict";
import test from "node:test";

import { getDelegationModeProfile, normalizeDelegationMode } from "../../src/orchestrator/delegation/mode.js";
import { applyDelegationPolicyGate } from "../../src/orchestrator/delegation/policyGate.js";

test("default mode resolves to balanced", () => {
  assert.equal(normalizeDelegationMode(undefined), "balanced");
  assert.equal(normalizeDelegationMode(""), "balanced");
  assert.equal(normalizeDelegationMode("unknown-mode"), "balanced");
});

test("mode profile only controls delegation policy, not subagent runtime budget", () => {
  const fast = getDelegationModeProfile("fast");
  const balanced = getDelegationModeProfile("balanced");
  const deep = getDelegationModeProfile("deep");

  assert.equal(fast.necessityScoreThreshold, 0.72);
  assert.equal(fast.maxConcurrentDelegations, 1);
  assert.equal(balanced.necessityScoreThreshold, 0.52);
  assert.equal(balanced.maxConcurrentDelegations, 1);
  assert.equal(deep.necessityScoreThreshold, 0.36);
  assert.equal(deep.maxConcurrentDelegations, 2);
  assert.equal("subagentBudget" in fast, false);
  assert.equal("subagentBudget" in balanced, false);
  assert.equal("subagentBudget" in deep, false);
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
