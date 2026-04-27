import assert from "node:assert/strict";
import test from "node:test";

import { applyDelegationPolicyGate } from "../../src/orchestrator/delegation/policyGate.js";
import { getDelegationModeProfile } from "../../src/orchestrator/delegation/mode.js";
import type { DelegationEvaluation } from "../../src/orchestrator/delegation/types.js";

function createEvaluation(overrides: Partial<DelegationEvaluation> = {}): DelegationEvaluation {
  return {
    action: "delegate_subagent",
    necessary: true,
    score: 0.9,
    confidence: "high",
    reasons: ["Complex task graph requires delegated exploration."],
    hardSignalCount: 2,
    intentSignalCount: 1,
    ...overrides,
  };
}

test("F03: policy gate can reject delegation even when evaluator says it is necessary", () => {
  const evaluation = createEvaluation({
    action: "delegate_subagent",
    necessary: true,
    score: 0.92,
  });
  const outcome = applyDelegationPolicyGate({
    decisionAction: "delegate_subagent",
    evaluation,
    mode: getDelegationModeProfile("balanced"),
    activeDelegationCount: 1,
    returnBarrierPending: false,
  });

  assert.equal(outcome.allow, false);
  assert.equal(outcome.reasonCode, "policy.concurrent_delegation_limit");
});

test("policy gate does not keep lane-specific exceptions", () => {
  const teammateWhileOneDelegationRuns = applyDelegationPolicyGate({
    decisionAction: "delegate_teammate",
    evaluation: createEvaluation({
      action: "delegate_teammate",
      necessary: true,
      score: 0.9,
    }),
    mode: getDelegationModeProfile("balanced"),
    activeDelegationCount: 1,
    returnBarrierPending: false,
  });
  assert.equal(teammateWhileOneDelegationRuns.allow, false);
  assert.equal(teammateWhileOneDelegationRuns.reasonCode, "policy.concurrent_delegation_limit");

  const secondSubagent = applyDelegationPolicyGate({
    decisionAction: "delegate_subagent",
    evaluation: createEvaluation({
      action: "delegate_subagent",
      necessary: true,
      score: 0.9,
    }),
    mode: getDelegationModeProfile("balanced"),
    activeDelegationCount: 1,
    returnBarrierPending: false,
  });
  assert.equal(secondSubagent.allow, false);
  assert.equal(secondSubagent.reasonCode, "policy.concurrent_delegation_limit");
});

test("policy gate keeps evaluator output advisory when hard constraints are clear", () => {
  const evaluation = createEvaluation({
    necessary: false,
    score: 0.3,
    hardSignalCount: 0,
    intentSignalCount: 1,
    confidence: "low",
  });
  const outcome = applyDelegationPolicyGate({
    decisionAction: "delegate_subagent",
    evaluation,
    mode: getDelegationModeProfile("balanced"),
    activeDelegationCount: 0,
    returnBarrierPending: false,
  });

  assert.equal(outcome.allow, true);
  assert.equal(outcome.reasonCode, "policy.allow_advisory_only");
});

test("policy gate allows when evaluation and machine constraints both pass", () => {
  const evaluation = createEvaluation({
    action: "delegate_teammate",
    necessary: true,
    score: 0.88,
  });
  const outcome = applyDelegationPolicyGate({
    decisionAction: "delegate_teammate",
    evaluation,
    mode: getDelegationModeProfile("deep"),
    activeDelegationCount: 0,
    returnBarrierPending: false,
  });

  assert.equal(outcome.allow, true);
  assert.equal(outcome.reasonCode, "policy.allow");
});
