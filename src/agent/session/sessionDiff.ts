import type { SessionDiffChange, SessionDiffState, SessionRecord } from "../../types.js";

const MAX_SESSION_DIFF_CHANGES = 20;
const MAX_SESSION_DIFF_PATHS = 24;
const MAX_DIFF_PREVIEW_CHARS = 2_000;

export function createEmptySessionDiff(timestamp = new Date().toISOString()): SessionDiffState {
  return {
    version: 1,
    changedPaths: [],
    changes: [],
    updatedAt: timestamp,
  };
}

export function normalizeSessionDiff(
  sessionDiff: SessionDiffState | undefined,
  timestamp = new Date().toISOString(),
): SessionDiffState {
  const normalizedChanges = (sessionDiff?.changes ?? [])
    .map((change) => normalizeSessionDiffChange(change, timestamp))
    .filter((change): change is SessionDiffChange => Boolean(change));

  return {
    version: 1,
    changedPaths: takeLastUniquePaths(sessionDiff?.changedPaths ?? []),
    changes: normalizedChanges.slice(-MAX_SESSION_DIFF_CHANGES),
    updatedAt: normalizeTimestamp(sessionDiff?.updatedAt, timestamp),
  };
}

export function normalizeSessionDiffState(session: SessionRecord): SessionRecord {
  return {
    ...session,
    sessionDiff: normalizeSessionDiff(session.sessionDiff),
  };
}

export function noteSessionDiff(
  session: SessionRecord,
  change: SessionDiffChange | undefined,
  timestamp = new Date().toISOString(),
): SessionRecord {
  if (!change) {
    return normalizeSessionDiffState(session);
  }

  const current = normalizeSessionDiff(session.sessionDiff, timestamp);
  const normalizedChange = normalizeSessionDiffChange(change, timestamp);
  if (!normalizedChange) {
    return {
      ...session,
      sessionDiff: current,
    };
  }

  return {
    ...session,
    sessionDiff: {
      version: 1,
      changedPaths: takeLastUniquePaths([...current.changedPaths, ...normalizedChange.changedPaths]),
      changes: [...current.changes, normalizedChange].slice(-MAX_SESSION_DIFF_CHANGES),
      updatedAt: timestamp,
    },
  };
}

function normalizeSessionDiffChange(
  change: SessionDiffChange | undefined,
  timestamp: string,
): SessionDiffChange | null {
  const toolName = normalizeText(change?.toolName);
  const changedPaths = takeLastUniquePaths(change?.changedPaths ?? []);
  if (!toolName || changedPaths.length === 0) {
    return null;
  }

  return {
    toolName,
    changeId: normalizeText(change?.changeId) || undefined,
    changedPaths,
    diff: truncate(change?.diff, MAX_DIFF_PREVIEW_CHARS),
    diagnosticsStatus: normalizeDiagnosticsStatus(change?.diagnosticsStatus),
    errorCount: normalizeCount(change?.errorCount),
    warningCount: normalizeCount(change?.warningCount),
    recordedAt: normalizeTimestamp(change?.recordedAt, timestamp),
  };
}

function takeLastUniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (let index = paths.length - 1; index >= 0; index -= 1) {
    const normalized = normalizeText(paths[index]);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.unshift(normalized);
    if (result.length >= MAX_SESSION_DIFF_PATHS) {
      break;
    }
  }

  return result;
}

function normalizeDiagnosticsStatus(value: SessionDiffChange["diagnosticsStatus"] | undefined): SessionDiffChange["diagnosticsStatus"] {
  return value === "issues" || value === "unavailable" ? value : "clean";
}

function normalizeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function truncate(value: string | undefined, maxChars: number): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`;
}
