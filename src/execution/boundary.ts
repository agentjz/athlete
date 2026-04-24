import type { ExecutionBoundaryProtocol, ExecutionProfile } from "./types.js";

const BOUNDARY_PROTOCOL = "deadmouse.execution-boundary.v1" as const;

const DEFAULTS: Record<ExecutionProfile, { maxRuntimeMs: number; maxIdleMs: number }> = {
  subagent: {
    maxRuntimeMs: 600_000,
    maxIdleMs: 120_000,
  },
  teammate: {
    maxRuntimeMs: 900_000,
    maxIdleMs: 180_000,
  },
  background: {
    maxRuntimeMs: 120_000,
    maxIdleMs: 30_000,
  },
};

const MIN_RUNTIME_MS = 1_000;
const MAX_RUNTIME_MS = 900_000;
const MIN_IDLE_MS = 1_000;
const MAX_IDLE_MS = 300_000;

export function resolveExecutionBoundary(input: {
  profile: ExecutionProfile;
  timeoutMs?: number;
  stallTimeoutMs?: number;
}): ExecutionBoundaryProtocol {
  const defaults = DEFAULTS[input.profile];
  return {
    protocol: BOUNDARY_PROTOCOL,
    returnTo: "lead",
    onBoundary: "return_to_lead_review",
    maxRuntimeMs: clampWholeNumber(input.timeoutMs, MIN_RUNTIME_MS, MAX_RUNTIME_MS, defaults.maxRuntimeMs),
    maxIdleMs: clampWholeNumber(input.stallTimeoutMs, MIN_IDLE_MS, MAX_IDLE_MS, defaults.maxIdleMs),
  };
}

function clampWholeNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}

