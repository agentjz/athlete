import type { SessionRecord, VerificationAttempt, VerificationState, VerificationStatus } from "../../types.js";

const MAX_OBSERVED_PATHS = 12;

export function createEmptyVerificationState(timestamp = new Date().toISOString()): VerificationState {
  return {
    status: "idle",
    attempts: 0,
    observedPaths: [],
    updatedAt: timestamp,
  };
}

export function normalizeVerificationState(
  state: VerificationState | undefined,
  timestamp = new Date().toISOString(),
): VerificationState | undefined {
  if (!state) {
    return undefined;
  }

  return {
    status: normalizeStatus(state.status),
    attempts: clampWholeNumber(state.attempts, 0, 50, 0),
    observedPaths: takeLastUniquePaths(state.observedPaths ?? [], MAX_OBSERVED_PATHS),
    lastCommand: normalizeText(state.lastCommand) || undefined,
    lastKind: normalizeText(state.lastKind) || undefined,
    lastExitCode: normalizeExitCode(state.lastExitCode),
    updatedAt: normalizeText(state.updatedAt) || timestamp,
  };
}

export function normalizeSessionVerificationState(session: SessionRecord): SessionRecord {
  return {
    ...session,
    verificationState: normalizeVerificationState(session.verificationState) ?? createEmptyVerificationState(),
  };
}

export function recordVerificationAttempt(
  state: VerificationState | undefined,
  attempt: VerificationAttempt,
  timestamp = new Date().toISOString(),
): VerificationState {
  const current = normalizeVerificationState(state, timestamp) ?? createEmptyVerificationState(timestamp);
  const command = normalizeText(attempt.command) || "verification";
  const kind = normalizeText(attempt.kind) || "verification";
  const exitCode = normalizeExitCode(attempt.exitCode) ?? null;
  const passed = Boolean(attempt.passed ?? (typeof exitCode === "number" && exitCode === 0));

  return {
    ...current,
    status: passed ? "passed" : "failed",
    attempts: current.attempts + 1,
    lastCommand: command,
    lastKind: kind,
    lastExitCode: exitCode,
    updatedAt: timestamp,
  };
}

export function recordVerificationObservedPaths(
  state: VerificationState | undefined,
  paths: string[],
  timestamp = new Date().toISOString(),
): VerificationState {
  const current = normalizeVerificationState(state, timestamp) ?? createEmptyVerificationState(timestamp);

  return {
    ...current,
    observedPaths: takeLastUniquePaths([
      ...paths,
      ...current.observedPaths,
    ], MAX_OBSERVED_PATHS),
    updatedAt: timestamp,
  };
}

export function formatVerificationStateBlock(state: VerificationState | undefined): string {
  const normalized = normalizeVerificationState(state) ?? createEmptyVerificationState();
  const paths = normalized.observedPaths.length > 0 ? normalized.observedPaths.join(" | ") : "none";
  const last = normalized.lastCommand
    ? `${normalized.lastKind ?? "verification"}: ${normalized.lastCommand} (exit ${String(normalized.lastExitCode ?? "unknown")})`
    : "none";

  return [
    `- Status: ${normalized.status}`,
    `- Observed paths: ${paths}`,
    `- Attempts: ${normalized.attempts}`,
    `- Last attempt: ${last}`,
    `- Updated at: ${normalized.updatedAt}`,
  ].join("\n");
}

function normalizeStatus(value: unknown): VerificationStatus {
  const normalized = normalizeText(value);
  return normalized === "passed" || normalized === "failed" ? normalized : "idle";
}

function normalizeExitCode(value: unknown): number | null | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  return value === null ? null : undefined;
}

function takeLastUniquePaths(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = normalizeText(values[index]);
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.unshift(value);
    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function clampWholeNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
