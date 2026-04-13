export const OBSERVABILITY_VERSION = 1 as const;

export interface ObservabilityErrorSummary {
  message: string;
  code?: string;
  details?: unknown;
}

export interface ObservabilityEventRecord {
  version: typeof OBSERVABILITY_VERSION;
  timestamp: string;
  event: string;
  status: string;
  host?: string;
  sessionId?: string;
  executionId?: string;
  identityKind?: string;
  identityName?: string;
  durationMs?: number;
  toolName?: string;
  model?: string;
  error?: ObservabilityErrorSummary;
  details?: Record<string, unknown>;
}

export interface ObservabilityEventInput {
  event: string;
  status: string;
  host?: string;
  sessionId?: string;
  executionId?: string;
  identityKind?: string;
  identityName?: string;
  durationMs?: number;
  toolName?: string;
  model?: string;
  error?: ObservabilityErrorSummary | unknown;
  details?: Record<string, unknown>;
}

export interface CrashReportRecord {
  version: typeof OBSERVABILITY_VERSION;
  timestamp: string;
  pid: number;
  argv: string[];
  commandContext: string;
  cwd: string;
  host?: string;
  sessionId?: string;
  executionId?: string;
  errorMessage: string;
  stack?: string;
  details?: Record<string, unknown>;
}

export function buildObservabilityEventRecord(input: ObservabilityEventInput): ObservabilityEventRecord {
  return {
    version: OBSERVABILITY_VERSION,
    timestamp: new Date().toISOString(),
    event: normalizeText(input.event, "unknown"),
    status: normalizeText(input.status, "unknown"),
    host: normalizeOptionalText(input.host),
    sessionId: normalizeOptionalText(input.sessionId),
    executionId: normalizeOptionalText(input.executionId),
    identityKind: normalizeOptionalText(input.identityKind),
    identityName: normalizeOptionalText(input.identityName),
    durationMs: normalizeOptionalNumber(input.durationMs),
    toolName: normalizeOptionalText(input.toolName),
    model: normalizeOptionalText(input.model),
    error: normalizeObservabilityError(input.error),
    details: normalizeDetails(input.details),
  };
}

export function buildCrashReportRecord(input: {
  cwd: string;
  host?: string;
  sessionId?: string;
  executionId?: string;
  error: unknown;
  details?: Record<string, unknown>;
}): CrashReportRecord {
  return {
    version: OBSERVABILITY_VERSION,
    timestamp: new Date().toISOString(),
    pid: process.pid,
    argv: [...process.argv],
    commandContext: process.argv.slice(2).join(" ").trim(),
    cwd: normalizeText(input.cwd, process.cwd()),
    host: normalizeOptionalText(input.host),
    sessionId: normalizeOptionalText(input.sessionId),
    executionId: normalizeOptionalText(input.executionId),
    errorMessage: readErrorMessage(input.error),
    stack: readErrorStack(input.error),
    details: normalizeDetails(input.details),
  };
}

export function normalizeObservabilityError(error: ObservabilityEventInput["error"]): ObservabilityErrorSummary | undefined {
  if (error == null) {
    return undefined;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const record = error as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
    };
    const message = normalizeText(record.message, "");
    if (!message) {
      return undefined;
    }
    return {
      message,
      code: normalizeOptionalText(record.code),
      details: normalizeValue(record.details),
    };
  }

  const message = readErrorMessage(error);
  return message ? { message } : undefined;
}

function normalizeDetails(details: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!details || typeof details !== "object") {
    return undefined;
  }

  const normalized = normalizeValue(details);
  return normalized && typeof normalized === "object" && !Array.isArray(normalized)
    ? normalized as Record<string, unknown>
    : undefined;
}

function normalizeValue(value: unknown, depth = 0): unknown {
  if (value == null) {
    return undefined;
  }

  if (depth >= 4) {
    return "[truncated]";
  }

  if (typeof value === "string") {
    return value.length <= 2_000 ? value : `${value.slice(0, 1_997)}...`;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: normalizeText(value.name, "Error"),
      message: normalizeText(value.message, "Unknown error"),
      stack: normalizeValue(value.stack, depth + 1),
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => normalizeValue(item, depth + 1)).filter((item) => item !== undefined);
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 30);
    const normalizedEntries = entries
      .map(([key, item]) => [key, normalizeValue(item, depth + 1)] as const)
      .filter(([, item]) => item !== undefined);
    return Object.fromEntries(normalizedEntries);
  }

  return normalizeText(String(value), "");
}

function normalizeText(value: unknown, fallback: string): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function normalizeOptionalText(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return normalizeText(error.message, error.name || "Unknown error");
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    return normalizeText((error as { message?: unknown }).message, "Unknown error");
  }

  return normalizeText(String(error ?? "Unknown error"), "Unknown error");
}

function readErrorStack(error: unknown): string | undefined {
  if (error instanceof Error && error.stack) {
    return error.stack;
  }

  if (typeof error === "object" && error !== null && "stack" in error) {
    const stack = String((error as { stack?: unknown }).stack ?? "").trim();
    return stack || undefined;
  }

  return undefined;
}
