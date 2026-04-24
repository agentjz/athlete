import type { RuntimeConfig } from "../../types.js";

export const DEFAULT_MANAGED_TURN_MAX_SLICES = 8;
export const DEFAULT_MANAGED_TURN_MAX_ELAPSED_MS = 180_000;

export interface ManagedSliceBudget {
  maxSlices: number;
  maxElapsedMs?: number;
}

export interface ManagedSliceBudgetSnapshot {
  slicesUsed: number;
  maxSlices: number;
  elapsedMs: number;
  maxElapsedMs?: number;
}

export interface ManagedSliceBudgetDecision {
  exhausted: boolean;
  snapshot: ManagedSliceBudgetSnapshot;
}

export function resolveManagedSliceBudget(
  config: Pick<RuntimeConfig, "managedTurnMaxSlices" | "managedTurnMaxElapsedMs" | "maxContinuationBatches">,
): ManagedSliceBudget {
  const fallbackMaxSlices = clampWholeNumber(config.maxContinuationBatches, 1, 20, DEFAULT_MANAGED_TURN_MAX_SLICES);
  return {
    maxSlices: clampWholeNumber(config.managedTurnMaxSlices, 1, 20, fallbackMaxSlices),
    maxElapsedMs: clampOptionalWholeNumber(config.managedTurnMaxElapsedMs, 1, 900_000),
  };
}

export function evaluateManagedSliceBudget(input: {
  budget: ManagedSliceBudget;
  slicesUsed: number;
  startedAtMs: number;
  nowMs?: number;
}): ManagedSliceBudgetDecision {
  const nowMs = typeof input.nowMs === "number" && Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const startedAtMs = Number.isFinite(input.startedAtMs) ? input.startedAtMs : nowMs;
  const elapsedMs = Math.max(0, Math.trunc(nowMs - startedAtMs));
  const snapshot: ManagedSliceBudgetSnapshot = {
    slicesUsed: Math.max(0, Math.trunc(input.slicesUsed)),
    maxSlices: input.budget.maxSlices,
    elapsedMs,
    maxElapsedMs: input.budget.maxElapsedMs,
  };

  return {
    exhausted: snapshot.slicesUsed >= snapshot.maxSlices || (
      typeof snapshot.maxElapsedMs === "number" && snapshot.elapsedMs > snapshot.maxElapsedMs
    ),
    snapshot,
  };
}

function clampWholeNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function clampOptionalWholeNumber(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}
