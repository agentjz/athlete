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
