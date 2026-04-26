import type { SubagentBudgetExceededReason } from "./budget.js";

export class SubagentBudgetExceededError extends Error {
  readonly reason: SubagentBudgetExceededReason;

  constructor(reason: SubagentBudgetExceededReason) {
    super(reason.message);
    this.name = "SubagentBudgetExceededError";
    this.reason = reason;
  }
}

export function isSubagentBudgetExceededError(error: unknown): error is SubagentBudgetExceededError {
  return error instanceof SubagentBudgetExceededError;
}

export function readSubagentBudgetExceededReason(error: unknown): SubagentBudgetExceededReason | undefined {
  if (error instanceof SubagentBudgetExceededError) {
    return error.reason;
  }

  if (!error || typeof error !== "object") {
    return undefined;
  }

  return readSubagentBudgetExceededReason((error as { cause?: unknown }).cause);
}
