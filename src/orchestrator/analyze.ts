import { isContinuationDirective, isInternalMessage, normalizeDelegationDirective, parseDelegationDirective } from "../agent/session.js";
import type { SessionRecord } from "../types.js";
import { normalizeBackgroundCommand } from "./commandNormalization.js";
import { buildOrchestratorObjective } from "./metadata.js";
import type { OrchestratorAnalysis, OrchestratorProgressSnapshot } from "./types.js";

export function analyzeOrchestratorInput(input: {
  input: string;
  session: SessionRecord;
  progress?: Partial<Pick<OrchestratorProgressSnapshot, "relevantTasks" | "runningBackgroundJobs" | "teammates">>;
}): OrchestratorAnalysis {
  const objective = buildOrchestratorObjective(resolveObjectiveText(input.input, input.session));
  const delegationDirective = normalizeDelegationDirective(
    parseDelegationDirective(input.input).directive.source === "user_prefix"
      ? parseDelegationDirective(input.input).directive
      : input.session.taskState?.delegationDirective,
  );
  const text = objective.text;
  const backgroundCommand = normalizeBackgroundCommand(extractBackgroundCommand(text));
  const wantsBackground = Boolean(backgroundCommand);
  const wantsSubagent = delegationDirective.subagent;
  const wantsTeammate = delegationDirective.teammate;

  let score = 0;
  if (objective.text.length >= 64) {
    score += 1;
  }
  if (objective.text.length >= 140) {
    score += 1;
  }
  if (countStructuralClauses(text) >= 2) {
    score += 1;
  }
  if (wantsBackground || wantsSubagent || wantsTeammate) {
    score += 1;
  }
  if ((input.progress?.relevantTasks?.length ?? 0) > 1) {
    score += 1;
  }
  if ((input.progress?.runningBackgroundJobs?.length ?? 0) > 0 || (input.progress?.teammates?.length ?? 0) > 0) {
    score += 1;
  }

  const complexity = score >= 4 ? "complex" : score >= 1 ? "moderate" : "simple";
  const prefersParallel = complexity !== "simple";
  const needsInvestigation = wantsSubagent;

  return {
    objective,
    delegationDirective,
    complexity,
    needsInvestigation,
    prefersParallel,
    wantsBackground,
    wantsSubagent,
    wantsTeammate,
    backgroundCommand,
  };
}

function resolveObjectiveText(input: string, session: SessionRecord): string {
  const normalizedInput = String(input ?? "").trim();
  if (normalizedInput && !isInternalMessage(normalizedInput) && !isContinuationDirective(normalizedInput)) {
    return parseDelegationDirective(normalizedInput).input || normalizedInput;
  }

  if (session.taskState?.objective && !isInternalMessage(session.taskState.objective)) {
    return session.taskState.objective;
  }

  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const message = session.messages[index];
    if (message?.role !== "user") {
      continue;
    }

    const content = String(message.content ?? "").trim();
    if (content && !isInternalMessage(content)) {
      return content;
    }
  }

  return normalizedInput || "Continue the current task.";
}

function extractBackgroundCommand(text: string): string | undefined {
  const prefixedMatch = text.match(/\bbackground\b\s*[:：]\s*([^\n]+)/i);
  if (prefixedMatch?.[1]) {
    return prefixedMatch[1].trim();
  }

  return undefined;
}

function countStructuralClauses(text: string): number {
  const matches = text.match(/[;,，；。]|(?:\s+\-\s+)|(?:\s*>\s*)/g);
  return matches?.length ?? 0;
}
