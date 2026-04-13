import { isContinuationDirective, isInternalMessage } from "../agent/session.js";
import type { SessionRecord } from "../types.js";
import { normalizeBackgroundCommand } from "./commandNormalization.js";
import {
  BACKGROUND_PATTERN,
  COMPLEXITY_PATTERN,
  INVESTIGATION_PATTERN,
  TEAMMATE_PATTERN,
} from "./intentLexicon.js";
import { buildOrchestratorObjective } from "./metadata.js";
import type { OrchestratorAnalysis, OrchestratorProgressSnapshot } from "./types.js";

export function analyzeOrchestratorInput(input: {
  input: string;
  session: SessionRecord;
  progress?: Partial<Pick<OrchestratorProgressSnapshot, "relevantTasks" | "runningBackgroundJobs" | "teammates">>;
}): OrchestratorAnalysis {
  const objective = buildOrchestratorObjective(resolveObjectiveText(input.input, input.session));
  const text = objective.text;
  const backgroundCommand = normalizeBackgroundCommand(extractBackgroundCommand(text));
  const needsInvestigation = INVESTIGATION_PATTERN.test(text);
  const wantsTeammate = TEAMMATE_PATTERN.test(text);
  const wantsBackground = Boolean(backgroundCommand) || BACKGROUND_PATTERN.test(text);
  const wantsSubagent = needsInvestigation || /\bsubagent\b|子智能体|子任务/.test(text);
  const prefersParallel = wantsTeammate || /\bparallel\b|同时|并行/.test(text);

  let score = 0;
  if (objective.text.length >= 72) {
    score += 1;
  }
  if (COMPLEXITY_PATTERN.test(text)) {
    score += 1;
  }
  if (needsInvestigation) {
    score += 1;
  }
  if (wantsTeammate || wantsBackground || wantsSubagent) {
    score += 1;
  }
  if ((input.progress?.relevantTasks?.length ?? 0) > 1) {
    score += 1;
  }
  if ((input.progress?.runningBackgroundJobs?.length ?? 0) > 0 || (input.progress?.teammates?.length ?? 0) > 0) {
    score += 1;
  }

  const complexity = score >= 4 ? "complex" : score >= 1 ? "moderate" : "simple";

  return {
    objective,
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
    return normalizedInput;
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
  const backtickMatch = text.match(/`([^`]+)`/);
  if (backtickMatch?.[1] && BACKGROUND_PATTERN.test(text)) {
    return backtickMatch[1].trim();
  }

  const prefixedMatch = text.match(/(?:background|后台)\s*[:：]\s*([^\n]+)/i);
  if (prefixedMatch?.[1]) {
    return prefixedMatch[1].trim();
  }

  return undefined;
}
