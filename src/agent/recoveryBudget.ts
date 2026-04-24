import type { RuntimeConfig } from "../types.js";

export const DEFAULT_PROVIDER_RECOVERY_MAX_ATTEMPTS = 6;
export const DEFAULT_PROVIDER_RECOVERY_MAX_ELAPSED_MS = 120_000;

export interface ProviderRecoveryBudget {
  maxAttempts: number;
  maxElapsedMs: number;
}

export interface ProviderRecoveryBudgetSnapshot {
  attemptsUsed: number;
  maxAttempts: number;
  elapsedMs: number;
  maxElapsedMs: number;
  lastError: string;
}

export interface ProviderRecoveryBudgetDecision {
  exhausted: boolean;
  snapshot: ProviderRecoveryBudgetSnapshot;
}

export function resolveProviderRecoveryBudget(
  config: Pick<RuntimeConfig, "providerRecoveryMaxAttempts" | "providerRecoveryMaxElapsedMs">,
): ProviderRecoveryBudget {
  return {
    maxAttempts: clampWholeNumber(config.providerRecoveryMaxAttempts, 1, 20, DEFAULT_PROVIDER_RECOVERY_MAX_ATTEMPTS),
    maxElapsedMs: clampWholeNumber(config.providerRecoveryMaxElapsedMs, 10_000, 600_000, DEFAULT_PROVIDER_RECOVERY_MAX_ELAPSED_MS),
  };
}

export function evaluateProviderRecoveryBudget(input: {
  budget: ProviderRecoveryBudget;
  attemptsUsed: number;
  recoveryStartedAtMs: number;
  nowMs?: number;
  lastError: unknown;
}): ProviderRecoveryBudgetDecision {
  const nowMs = typeof input.nowMs === "number" && Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const startedAtMs = Number.isFinite(input.recoveryStartedAtMs) ? input.recoveryStartedAtMs : nowMs;
  const elapsedMs = Math.max(0, Math.trunc(nowMs - startedAtMs));
  const snapshot: ProviderRecoveryBudgetSnapshot = {
    attemptsUsed: Math.max(0, Math.trunc(input.attemptsUsed)),
    maxAttempts: input.budget.maxAttempts,
    elapsedMs,
    maxElapsedMs: input.budget.maxElapsedMs,
    lastError: normalizeErrorText(input.lastError),
  };

  return {
    exhausted: snapshot.attemptsUsed > snapshot.maxAttempts || snapshot.elapsedMs > snapshot.maxElapsedMs,
    snapshot,
  };
}

function clampWholeNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function normalizeErrorText(error: unknown): string {
  const raw = typeof error === "object" && error && "message" in error
    ? String((error as { message?: unknown }).message ?? "request failed")
    : String(error ?? "request failed");
  const compact = raw.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "request failed";
  }

  return compact.length <= 220 ? compact : `${compact.slice(0, 220)}...`;
}
