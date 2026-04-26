import type { OrchestratorAction } from "../types.js";
import type { ExecutionProfile } from "../../execution/types.js";

export type DelegationMode = "fast" | "balanced" | "deep";

export type DelegationDecisionAction =
  | "delegate_subagent"
  | "delegate_teammate"
  | "run_in_background";

export type DelegationEvaluationConfidence = "low" | "medium" | "high";

export interface DelegationSubagentBudget {
  maxToolCalls: number;
  maxModelTurns: number;
  maxElapsedMs: number;
}

export interface DelegationModeProfile {
  mode: DelegationMode;
  necessityScoreThreshold: number;
  maxConcurrentDelegations: number;
  subagentBudget: DelegationSubagentBudget;
}

export interface DelegationEvaluation {
  action: DelegationDecisionAction;
  necessary: boolean;
  score: number;
  confidence: DelegationEvaluationConfidence;
  reasons: string[];
  hardSignalCount: number;
  intentSignalCount: number;
}

export interface DelegationPolicyGateInput {
  decisionAction: OrchestratorAction;
  evaluation: DelegationEvaluation;
  mode: DelegationModeProfile;
  activeDelegationCount: number;
  activeDelegationProfiles?: ExecutionProfile[];
  returnBarrierPending: boolean;
  allowDualAgentLanes?: boolean;
}

export interface DelegationPolicyGateOutcome {
  allow: boolean;
  reasonCode: string;
  reason: string;
}

export function isDelegationDecisionAction(action: OrchestratorAction): action is DelegationDecisionAction {
  return action === "delegate_subagent" || action === "delegate_teammate" || action === "run_in_background";
}
