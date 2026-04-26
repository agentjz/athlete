import type { OrchestratorAnalysis, OrchestratorProgressSnapshot } from "../types.js";
import type { DelegationDecisionAction, DelegationEvaluation } from "./types.js";

export function evaluateDelegationNecessity(input: {
  decisionAction: DelegationDecisionAction;
  analysis: OrchestratorAnalysis;
  progress: Pick<OrchestratorProgressSnapshot, "relevantTasks" | "readyTasks" | "activeExecutions">;
}): DelegationEvaluation {
  const objectiveText = input.analysis.objective.text;
  const reasons: string[] = [];
  let score = 0;
  let hardSignalCount = 0;
  let intentSignalCount = 0;

  if (input.analysis.complexity === "complex") {
    score += 0.18;
    hardSignalCount += 1;
    reasons.push("Overall orchestration complexity is marked as complex.");
  }

  if (objectiveText.length >= 140) {
    score += 0.28;
    hardSignalCount += 1;
    reasons.push("Objective scope is large enough to justify delegation.");
  } else if (objectiveText.length >= 80) {
    score += 0.22;
    hardSignalCount += 1;
    reasons.push("Objective length suggests multi-stage coordination pressure.");
  }

  if (input.progress.readyTasks.length >= 2) {
    score += 0.14;
    hardSignalCount += 1;
    reasons.push("Multiple ready stages can benefit from delegated lanes.");
  }

  if (input.progress.activeExecutions.length > 0) {
    score += 0.1;
    hardSignalCount += 1;
    reasons.push("Delegated lanes are already active and coordination overhead exists.");
  }

  const actionIntent = readActionIntentSignal(input.decisionAction, input.analysis);
  if (actionIntent) {
    score += 0.18;
    intentSignalCount += 1;
    reasons.push(actionIntent);
  }

  const normalizedScore = clampScore(score);
  const necessary = hardSignalCount > 0 && normalizedScore >= 0.5;

  return {
    action: input.decisionAction,
    necessary,
    score: normalizedScore,
    confidence: readConfidence(normalizedScore),
    reasons,
    hardSignalCount,
    intentSignalCount,
  };
}

function readActionIntentSignal(
  action: DelegationDecisionAction,
  analysis: OrchestratorAnalysis,
): string | undefined {
  if (action === "delegate_subagent" && analysis.wantsSubagent) {
    return "Current objective explicitly opens subagent support.";
  }

  if (action === "delegate_teammate" && analysis.wantsTeammate) {
    return "Current objective explicitly opens teammate support.";
  }

  if (action === "run_in_background" && (analysis.wantsBackground || Boolean(analysis.backgroundCommand))) {
    return "Analysis indicates long-running/background execution intent.";
  }

  return undefined;
}

function readConfidence(score: number): DelegationEvaluation["confidence"] {
  if (score >= 0.8) {
    return "high";
  }
  if (score >= 0.55) {
    return "medium";
  }
  return "low";
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}
