import { getDelegationModeProfile, normalizeDelegationMode } from "../orchestrator/delegation/mode.js";
import type { DelegationMode } from "../orchestrator/delegation/types.js";

export type SubagentBudgetDimension = "tool_calls" | "model_turns" | "elapsed_ms";

export interface SubagentBudget {
  maxToolCalls: number;
  maxModelTurns: number;
  maxElapsedMs: number;
}

export interface SubagentBudgetSnapshot extends SubagentBudget {
  toolCalls: number;
  modelTurns: number;
  elapsedMs: number;
}

export interface SubagentBudgetExceededReason {
  code: "subagent_budget_exhausted";
  dimension: SubagentBudgetDimension;
  message: string;
  snapshot: SubagentBudgetSnapshot;
}

export interface SubagentBudgetTracker {
  noteToolCall: (toolName?: string) => SubagentBudgetExceededReason | undefined;
  noteModelTurn: () => SubagentBudgetExceededReason | undefined;
  evaluate: () => SubagentBudgetExceededReason | undefined;
  snapshot: () => SubagentBudgetSnapshot;
}

export function resolveSubagentBudget(mode: DelegationMode | string | undefined): SubagentBudget {
  const profile = getDelegationModeProfile(normalizeDelegationMode(mode));
  return {
    maxToolCalls: profile.subagentBudget.maxToolCalls,
    maxModelTurns: profile.subagentBudget.maxModelTurns,
    maxElapsedMs: profile.subagentBudget.maxElapsedMs,
  };
}

export function createSubagentBudgetTracker(
  budget: SubagentBudget,
  now: () => number = () => Date.now(),
): SubagentBudgetTracker {
  const startedAtMs = safeNow(now);
  let toolCalls = 0;
  let modelTurns = 0;

  const snapshot = (): SubagentBudgetSnapshot => ({
    toolCalls,
    modelTurns,
    elapsedMs: Math.max(0, safeNow(now) - startedAtMs),
    maxToolCalls: budget.maxToolCalls,
    maxModelTurns: budget.maxModelTurns,
    maxElapsedMs: budget.maxElapsedMs,
  });

  const evaluate = (): SubagentBudgetExceededReason | undefined => {
    const current = snapshot();
    if (current.toolCalls > current.maxToolCalls) {
      return createSubagentBudgetExceededReason("tool_calls", current);
    }
    if (current.modelTurns > current.maxModelTurns) {
      return createSubagentBudgetExceededReason("model_turns", current);
    }
    if (current.elapsedMs > current.maxElapsedMs) {
      return createSubagentBudgetExceededReason("elapsed_ms", current);
    }
    return undefined;
  };

  return {
    noteToolCall: () => {
      toolCalls += 1;
      return evaluate();
    },
    noteModelTurn: () => {
      modelTurns += 1;
      return evaluate();
    },
    evaluate,
    snapshot,
  };
}

export function createSubagentBudgetExceededReason(
  dimension: SubagentBudgetDimension,
  snapshot: SubagentBudgetSnapshot,
): SubagentBudgetExceededReason {
  const label = dimension === "tool_calls"
    ? `tool calls ${snapshot.toolCalls}/${snapshot.maxToolCalls}`
    : dimension === "model_turns"
      ? `model turns ${snapshot.modelTurns}/${snapshot.maxModelTurns}`
      : `elapsed ${snapshot.elapsedMs}/${snapshot.maxElapsedMs}ms`;

  return {
    code: "subagent_budget_exhausted",
    dimension,
    message: `Subagent budget exhausted (${label}). Returning control to lead.`,
    snapshot,
  };
}

function safeNow(now: () => number): number {
  const value = Number(now());
  if (!Number.isFinite(value)) {
    return Date.now();
  }
  return Math.trunc(value);
}
