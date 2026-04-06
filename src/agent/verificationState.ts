import type { SessionRecord, VerificationAttempt, VerificationState, VerificationStatus } from "../types.js";

const MAX_PENDING_PATHS = 12;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_NO_PROGRESS = 2;
const DEFAULT_MAX_REMINDERS = 3;

export function createEmptyVerificationState(timestamp = new Date().toISOString()): VerificationState {
  return {
    status: "idle",
    attempts: 0,
    reminderCount: 0,
    noProgressCount: 0,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    maxNoProgress: DEFAULT_MAX_NO_PROGRESS,
    maxReminders: DEFAULT_MAX_REMINDERS,
    pendingPaths: [],
    updatedAt: timestamp,
  };
}

export function normalizeVerificationState(state: VerificationState | undefined): VerificationState | undefined {
  if (!state) {
    return undefined;
  }

  return {
    status: normalizeStatus(state.status),
    attempts: clampWholeNumber(state.attempts, 0, 50, 0),
    reminderCount: clampWholeNumber(state.reminderCount, 0, 50, 0),
    noProgressCount: clampWholeNumber(state.noProgressCount, 0, 50, 0),
    maxAttempts: clampWholeNumber(state.maxAttempts, 1, 10, DEFAULT_MAX_ATTEMPTS),
    maxNoProgress: clampWholeNumber(state.maxNoProgress, 1, 10, DEFAULT_MAX_NO_PROGRESS),
    maxReminders: clampWholeNumber(state.maxReminders, 1, 10, DEFAULT_MAX_REMINDERS),
    pendingPaths: takeLastUniquePaths(state.pendingPaths ?? [], MAX_PENDING_PATHS),
    lastCommand: normalizeText(state.lastCommand) || undefined,
    lastKind: normalizeText(state.lastKind) || undefined,
    lastExitCode: typeof state.lastExitCode === "number" && Number.isFinite(state.lastExitCode)
      ? Math.trunc(state.lastExitCode)
      : state.lastExitCode === null
        ? null
        : undefined,
    lastFailureSignature: normalizeText(state.lastFailureSignature) || undefined,
    pauseReason: normalizeText(state.pauseReason) || undefined,
    updatedAt: typeof state.updatedAt === "string" && state.updatedAt ? state.updatedAt : new Date().toISOString(),
  };
}

export function normalizeSessionVerificationState(session: SessionRecord): SessionRecord {
  return {
    ...session,
    verificationState: normalizeVerificationState(session.verificationState) ?? createEmptyVerificationState(),
  };
}

export function markVerificationRequired(
  state: VerificationState | undefined,
  input: {
    pendingPaths?: string[];
  } = {},
  timestamp = new Date().toISOString(),
): VerificationState {
  const current = normalizeVerificationState(state) ?? createEmptyVerificationState(timestamp);
  const pendingPaths = takeLastUniquePaths([
    ...(input.pendingPaths ?? []),
    ...current.pendingPaths,
  ], MAX_PENDING_PATHS);

  return {
    ...current,
    status: "required",
    attempts: 0,
    reminderCount: 0,
    noProgressCount: 0,
    lastCommand: undefined,
    lastKind: undefined,
    lastExitCode: undefined,
    lastFailureSignature: undefined,
    pauseReason: undefined,
    pendingPaths,
    updatedAt: timestamp,
  };
}

export function recordVerificationAttempt(
  state: VerificationState | undefined,
  attempt: VerificationAttempt,
  timestamp = new Date().toISOString(),
): VerificationState {
  const current = normalizeVerificationState(state) ?? createEmptyVerificationState(timestamp);
  const command = normalizeText(attempt.command) || "verification";
  const kind = normalizeText(attempt.kind) || "verification";
  const exitCode = typeof attempt.exitCode === "number" && Number.isFinite(attempt.exitCode)
    ? Math.trunc(attempt.exitCode)
    : attempt.exitCode === null
      ? null
      : null;
  const passed = Boolean(attempt.passed ?? (typeof exitCode === "number" && exitCode === 0));

  if (passed) {
    return {
      ...current,
      status: "passed",
      attempts: current.attempts + 1,
      reminderCount: 0,
      noProgressCount: 0,
      pendingPaths: [],
      lastCommand: command,
      lastKind: kind,
      lastExitCode: exitCode,
      lastFailureSignature: undefined,
      pauseReason: undefined,
      updatedAt: timestamp,
    };
  }

  const signature = `${kind}|${String(exitCode)}|${command.toLowerCase()}`;
  const noProgressCount = current.lastFailureSignature === signature ? current.noProgressCount + 1 : 1;
  const attempts = current.attempts + 1;
  const awaitingUser = attempts >= current.maxAttempts || noProgressCount >= current.maxNoProgress;

  return {
    ...current,
    status: awaitingUser ? "awaiting_user" : "required",
    attempts,
    noProgressCount,
    lastCommand: command,
    lastKind: kind,
    lastExitCode: exitCode,
    lastFailureSignature: signature,
    pauseReason: awaitingUser
      ? buildPauseReason(command, kind, exitCode, attempts, noProgressCount)
      : undefined,
    updatedAt: timestamp,
  };
}

export function noteVerificationReminder(
  state: VerificationState | undefined,
  timestamp = new Date().toISOString(),
): VerificationState {
  const current = normalizeVerificationState(state) ?? createEmptyVerificationState(timestamp);
  const reminderCount = current.reminderCount + 1;
  const awaitingUser = current.attempts === 0 && reminderCount >= current.maxReminders;

  return {
    ...current,
    status: awaitingUser ? "awaiting_user" : current.status === "idle" ? "required" : current.status,
    reminderCount,
    pauseReason: awaitingUser
      ? "Verification was requested repeatedly, but no targeted verification command was produced. Pause and wait for the user to clarify the desired check."
      : current.pauseReason,
    updatedAt: timestamp,
  };
}

export function clearVerificationPause(
  state: VerificationState | undefined,
  timestamp = new Date().toISOString(),
): VerificationState {
  const current = normalizeVerificationState(state) ?? createEmptyVerificationState(timestamp);
  return {
    ...current,
    status: current.pendingPaths.length > 0 ? "required" : "idle",
    pauseReason: undefined,
    updatedAt: timestamp,
  };
}

export function isVerificationRequired(state: VerificationState | undefined): boolean {
  const status = normalizeVerificationState(state)?.status;
  return status === "required" || status === "awaiting_user";
}

export function isVerificationAwaitingUser(state: VerificationState | undefined): boolean {
  return normalizeVerificationState(state)?.status === "awaiting_user";
}

export function formatVerificationStateBlock(state: VerificationState | undefined): string {
  const normalized = normalizeVerificationState(state) ?? createEmptyVerificationState();
  const pending = normalized.pendingPaths.length > 0 ? normalized.pendingPaths.join(" | ") : "none";
  const last = normalized.lastCommand
    ? `${normalized.lastKind ?? "verification"}: ${normalized.lastCommand} (exit ${String(normalized.lastExitCode ?? "unknown")})`
    : "none";
  const pause = normalized.pauseReason || "none";

  return [
    `- Status: ${normalized.status}`,
    `- Pending paths: ${pending}`,
    `- Attempts: ${normalized.attempts}/${normalized.maxAttempts}`,
    `- No-progress: ${normalized.noProgressCount}/${normalized.maxNoProgress}`,
    `- Reminders: ${normalized.reminderCount}/${normalized.maxReminders}`,
    `- Last attempt: ${last}`,
    `- Pause reason: ${pause}`,
    `- Updated at: ${normalized.updatedAt}`,
  ].join("\n");
}

function buildPauseReason(
  command: string,
  kind: string,
  exitCode: number | null,
  attempts: number,
  noProgressCount: number,
): string {
  return `Verification is paused after ${attempts} failed attempt(s) and ${noProgressCount} repeated no-progress result(s). Latest check was ${kind} (${String(exitCode ?? "unknown")}): ${command}`;
}

function normalizeStatus(value: unknown): VerificationStatus {
  const normalized = normalizeText(value);
  return normalized === "required" || normalized === "passed" || normalized === "awaiting_user" ? normalized : "idle";
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
