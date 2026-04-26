import type { DelegationPolicyGateInput, DelegationPolicyGateOutcome } from "./types.js";
import { isDelegationDecisionAction } from "./types.js";

export function applyDelegationPolicyGate(input: DelegationPolicyGateInput): DelegationPolicyGateOutcome {
  if (!isDelegationDecisionAction(input.decisionAction)) {
    return allow("policy.non_delegation_action", "Action does not require a delegation gate.");
  }

  if (input.returnBarrierPending) {
    return deny(
      "policy.return_barrier_pending",
      "Return barrier is pending; lead review must run before another delegation.",
    );
  }

  if (input.activeDelegationCount >= input.mode.maxConcurrentDelegations && !canFillExplicitDualAgentLane(input)) {
    return deny(
      "policy.concurrent_delegation_limit",
      `Active delegations ${input.activeDelegationCount} reached mode limit ${input.mode.maxConcurrentDelegations}.`,
    );
  }

  if (!input.evaluation.necessary || input.evaluation.score < input.mode.necessityScoreThreshold) {
    return allow(
      "policy.allow_advisory_only",
      "Delegation evaluation is advisory in this mode; only hard machine constraints can block dispatch.",
    );
  }

  return allow("policy.allow", "Delegation passed evaluator and machine policy checks.");
}

function canFillExplicitDualAgentLane(input: DelegationPolicyGateInput): boolean {
  if (!input.allowDualAgentLanes) {
    return false;
  }

  if (input.decisionAction !== "delegate_subagent" && input.decisionAction !== "delegate_teammate") {
    return false;
  }

  const targetProfile = input.decisionAction === "delegate_subagent" ? "subagent" : "teammate";
  const otherProfile = targetProfile === "subagent" ? "teammate" : "subagent";
  const activeProfiles = input.activeDelegationProfiles ?? [];
  const activeAgentProfiles = activeProfiles.filter((profile) => profile === "subagent" || profile === "teammate");
  return (
    input.activeDelegationCount === 1 &&
    activeAgentProfiles.length === 1 &&
    activeAgentProfiles[0] === otherProfile &&
    !activeProfiles.includes(targetProfile)
  );
}

function allow(reasonCode: string, reason: string): DelegationPolicyGateOutcome {
  return {
    allow: true,
    reasonCode,
    reason,
  };
}

function deny(reasonCode: string, reason: string): DelegationPolicyGateOutcome {
  return {
    allow: false,
    reasonCode,
    reason,
  };
}
