import type { DelegationMode, DelegationModeProfile } from "./types.js";

export const DEFAULT_DELEGATION_MODE: DelegationMode = "balanced";

const MODE_PROFILES: Record<DelegationMode, DelegationModeProfile> = {
  fast: {
    mode: "fast",
    necessityScoreThreshold: 0.72,
    maxConcurrentDelegations: 1,
    subagentBudget: {
      maxToolCalls: 4,
      maxModelTurns: 3,
      maxElapsedMs: 120_000,
    },
  },
  balanced: {
    mode: "balanced",
    necessityScoreThreshold: 0.52,
    maxConcurrentDelegations: 1,
    subagentBudget: {
      maxToolCalls: 10,
      maxModelTurns: 8,
      maxElapsedMs: 360_000,
    },
  },
  deep: {
    mode: "deep",
    necessityScoreThreshold: 0.36,
    maxConcurrentDelegations: 2,
    subagentBudget: {
      maxToolCalls: 20,
      maxModelTurns: 16,
      maxElapsedMs: 900_000,
    },
  },
};

export function normalizeDelegationMode(value: unknown): DelegationMode {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "fast" || normalized === "quick" || normalized === "快") {
    return "fast";
  }

  if (normalized === "deep" || normalized === "depth" || normalized === "深度") {
    return "deep";
  }

  if (normalized === "balanced" || normalized === "balance" || normalized === "均衡") {
    return "balanced";
  }

  return DEFAULT_DELEGATION_MODE;
}

export function getDelegationModeProfile(mode: DelegationMode | string | undefined): DelegationModeProfile {
  const normalized = normalizeDelegationMode(mode);
  return MODE_PROFILES[normalized];
}
