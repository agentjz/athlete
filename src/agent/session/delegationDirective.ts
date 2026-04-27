export interface DelegationDirective {
  teammate: boolean;
  subagent: boolean;
  source: "none" | "model_decision";
}

const NONE: DelegationDirective = {
  teammate: false,
  subagent: false,
  source: "none",
};

export function normalizeDelegationDirective(value: unknown): DelegationDirective {
  if (!value || typeof value !== "object") {
    return NONE;
  }

  const record = value as Partial<DelegationDirective>;
  const teammate = Boolean(record.teammate);
  const subagent = Boolean(record.subagent);
  return {
    teammate,
    subagent,
    source: teammate || subagent ? "model_decision" : "none",
  };
}
