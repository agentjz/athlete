import type { AgentLane } from "../../types.js";

export interface DelegationDirective {
  teammate: boolean;
  subagent: boolean;
  source: "none" | "model_decision";
}

export interface DelegationCapabilities {
  teammate: boolean;
  subagent: boolean;
}

const NONE: DelegationDirective = {
  teammate: false,
  subagent: false,
  source: "none",
};

export function delegationCapabilitiesFromLane(lane: AgentLane | undefined): DelegationCapabilities {
  if (lane === "team") {
    return { teammate: true, subagent: false };
  }
  if (lane === "subagent") {
    return { teammate: false, subagent: true };
  }
  if (lane === "allpeople") {
    return { teammate: true, subagent: true };
  }
  return { teammate: false, subagent: false };
}

export function delegationDirectiveFromLane(lane: AgentLane | undefined): DelegationDirective {
  const capabilities = delegationCapabilitiesFromLane(lane);
  if (capabilities.teammate || capabilities.subagent) {
    return { ...capabilities, source: "model_decision" };
  }
  return NONE;
}

export function normalizeDelegationCapabilities(value: unknown): DelegationCapabilities {
  if (!value || typeof value !== "object") {
    return { teammate: false, subagent: false };
  }
  const record = value as Partial<DelegationCapabilities>;
  return {
    teammate: Boolean(record.teammate),
    subagent: Boolean(record.subagent),
  };
}

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
