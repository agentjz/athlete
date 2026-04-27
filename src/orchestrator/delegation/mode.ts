import type { DelegationMode, DelegationModeProfile } from "./types.js";

export const DEFAULT_DELEGATION_MODE: DelegationMode = "balanced";

const MODE_PROFILES: Record<DelegationMode, DelegationModeProfile> = {
  fast: {
    mode: "fast",
    necessityScoreThreshold: 0.72,
    maxConcurrentDelegations: 1,
  },
  balanced: {
    mode: "balanced",
    necessityScoreThreshold: 0.52,
    maxConcurrentDelegations: 1,
  },
  deep: {
    mode: "deep",
    necessityScoreThreshold: 0.36,
    maxConcurrentDelegations: 2,
  },
};

export function normalizeDelegationMode(value: unknown): DelegationMode {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "fast" || normalized === "quick") {
    return "fast";
  }

  if (normalized === "deep" || normalized === "depth") {
    return "deep";
  }

  if (normalized === "balanced" || normalized === "balance") {
    return "balanced";
  }

  return DEFAULT_DELEGATION_MODE;
}

export function getDelegationModeProfile(mode: DelegationMode | string | undefined): DelegationModeProfile {
  const normalized = normalizeDelegationMode(mode);
  return MODE_PROFILES[normalized];
}
