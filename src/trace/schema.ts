export const AGENT_TRACE_VERSION = 1 as const;

export type AgentTraceEventKind =
  | "turn_started"
  | "model_request"
  | "model_response"
  | "tool_call"
  | "tool_result"
  | "turn_finalized"
  | "turn_yielded"
  | "turn_paused"
  | "turn_recovered"
  | "turn_failed";

export interface AgentTraceArtifactRef {
  scope: "project_state_root";
  storagePath: string;
  byteLength?: number;
  charLength?: number;
  sha256?: string;
}

export interface AgentTraceEventRecord {
  version: typeof AGENT_TRACE_VERSION;
  timestamp: string;
  kind: AgentTraceEventKind;
  sessionId: string;
  turnId: string;
  sequence: number;
  identityKind?: string;
  identityName?: string;
  summary: string;
  data?: Record<string, unknown>;
  artifacts?: AgentTraceArtifactRef[];
}

export interface AgentTraceEventInput {
  kind: AgentTraceEventKind;
  sessionId: string;
  turnId: string;
  identityKind?: string;
  identityName?: string;
  summary: string;
  data?: Record<string, unknown>;
  artifacts?: AgentTraceArtifactRef[];
}

export function buildAgentTraceEventRecord(
  sequence: number,
  input: AgentTraceEventInput,
): AgentTraceEventRecord {
  return {
    version: AGENT_TRACE_VERSION,
    timestamp: new Date().toISOString(),
    kind: input.kind,
    sessionId: normalizeText(input.sessionId, "unknown-session"),
    turnId: normalizeText(input.turnId, "unknown-turn"),
    sequence: Math.max(1, Math.trunc(sequence)),
    identityKind: normalizeOptionalText(input.identityKind),
    identityName: normalizeOptionalText(input.identityName),
    summary: normalizeText(input.summary, input.kind),
    data: normalizeRecord(input.data),
    artifacts: normalizeArtifacts(input.artifacts),
  };
}

function normalizeRecord(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const normalized = normalizeValue(value);
  return normalized && typeof normalized === "object" && !Array.isArray(normalized)
    ? normalized as Record<string, unknown>
    : undefined;
}

function normalizeArtifacts(value: AgentTraceArtifactRef[] | undefined): AgentTraceArtifactRef[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const artifacts = value
    .map((artifact) => ({
      scope: "project_state_root" as const,
      storagePath: normalizeText(artifact.storagePath, ""),
      byteLength: normalizeOptionalNumber(artifact.byteLength),
      charLength: normalizeOptionalNumber(artifact.charLength),
      sha256: normalizeOptionalText(artifact.sha256),
    }))
    .filter((artifact) => artifact.storagePath.length > 0);

  return artifacts.length > 0 ? artifacts : undefined;
}

function normalizeValue(value: unknown, depth = 0): unknown {
  if (value == null) {
    return undefined;
  }

  if (depth >= 5) {
    return "[truncated]";
  }

  if (typeof value === "string") {
    return value.length <= 8_000 ? value : `${value.slice(0, 7_997)}...`;
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
    return value.slice(0, 80).map((item) => normalizeValue(item, depth + 1)).filter((item) => item !== undefined);
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 80);
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
