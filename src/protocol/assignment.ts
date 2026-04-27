import { normalizeProtocolId } from "./capability.js";

export const ASSIGNMENT_PROTOCOL = "deadmouse.assignment" as const;

export interface AssignmentBudget {
  maxRuntimeMs?: number;
  maxIdleMs?: number;
  maxToolIterations?: number;
  notes?: string;
}

export interface AssignmentContract {
  protocol: typeof ASSIGNMENT_PROTOCOL;
  assignmentId: string;
  capabilityId: string;
  objective: string;
  scope: string;
  constraints: readonly string[];
  expectedOutput: string;
  budget: AssignmentBudget;
  returnConditions: readonly string[];
  createdBy: string;
  createdAt: string;
}

export function createAssignmentContract(input: {
  assignmentId?: string;
  capabilityId: string;
  objective: string;
  scope?: string;
  constraints?: readonly string[];
  expectedOutput?: string;
  budget?: AssignmentBudget;
  returnConditions?: readonly string[];
  createdBy?: string;
  createdAt?: string;
}): AssignmentContract {
  return {
    protocol: ASSIGNMENT_PROTOCOL,
    assignmentId: input.assignmentId ? normalizeProtocolId(input.assignmentId) : createAssignmentId(input.capabilityId),
    capabilityId: normalizeProtocolId(input.capabilityId),
    objective: requireText(input.objective, "objective"),
    scope: input.scope?.trim() || "Only the delegated objective and directly necessary evidence.",
    constraints: [...(input.constraints ?? [])],
    expectedOutput: input.expectedOutput?.trim() || "Return a CloseoutContract with concrete evidence and next Lead suggestion.",
    budget: input.budget ?? {},
    returnConditions: input.returnConditions?.length
      ? [...input.returnConditions]
      : ["done", "failed", "blocked", "budget_exhausted"],
    createdBy: input.createdBy?.trim() || "lead",
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function formatAssignmentContract(contract: AssignmentContract): string {
  return [
    `<assignment protocol="${contract.protocol}" id="${contract.assignmentId}" capability="${contract.capabilityId}">`,
    `objective: ${contract.objective}`,
    `scope: ${contract.scope}`,
    `constraints: ${contract.constraints.length > 0 ? contract.constraints.join("; ") : "none"}`,
    `expected_output: ${contract.expectedOutput}`,
    `budget: ${formatBudget(contract.budget)}`,
    `return_conditions: ${contract.returnConditions.join("; ")}`,
    `created_by: ${contract.createdBy}`,
    `created_at: ${contract.createdAt}`,
    "</assignment>",
  ].join("\n");
}

function createAssignmentId(capabilityId: string): string {
  return `${normalizeProtocolId(capabilityId)}-${Date.now().toString(36)}`;
}

function requireText(value: string, field: string): string {
  const text = value.trim();
  if (!text) {
    throw new Error(`AssignmentContract.${field} is required.`);
  }
  return text;
}

function formatBudget(budget: AssignmentBudget): string {
  const entries = [
    typeof budget.maxRuntimeMs === "number" ? `maxRuntimeMs=${budget.maxRuntimeMs}` : undefined,
    typeof budget.maxIdleMs === "number" ? `maxIdleMs=${budget.maxIdleMs}` : undefined,
    typeof budget.maxToolIterations === "number" ? `maxToolIterations=${budget.maxToolIterations}` : undefined,
    budget.notes ? `notes=${budget.notes}` : undefined,
  ].filter(Boolean);
  return entries.length > 0 ? entries.join(", ") : "default runtime boundary";
}
