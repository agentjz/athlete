import { PROTOCOL_REQUEST_KINDS, TEAM_PROTOCOL_VERSION } from "./types.js";
import type { TeamMessageRecord, TeamMessageType } from "./types.js";

const VALID_MESSAGE_TYPES: TeamMessageType[] = [
  "message",
  "broadcast",
  "execution_closeout",
  "protocol_request",
  "protocol_response",
];
const REQUIRED_FIELDS_BY_TYPE: Record<TeamMessageType, readonly (keyof TeamMessageRecord)[]> = {
  message: [],
  broadcast: [],
  execution_closeout: ["executionId", "executionStatus", "executionProfile"],
  protocol_request: ["protocolKind", "requestId"],
  protocol_response: ["protocolKind", "requestId", "approve"],
};
const MAX_PROTOCOL_ERROR_PREVIEW_CHARS = 800;

export function normalizeTeamActorName(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, "-").trim();
}

export function isValidTeamMessageType(type: string): type is TeamMessageType {
  return VALID_MESSAGE_TYPES.includes(type as TeamMessageType);
}

export function validateTeamMessage(
  raw: unknown,
): { ok: true; message: TeamMessageRecord } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Message payload must be an object." };
  }

  const message = raw as TeamMessageRecord;
  if (!Number.isInteger(message.protocolVersion)) {
    return { ok: false, error: "Missing or invalid protocolVersion." };
  }
  if (message.protocolVersion !== TEAM_PROTOCOL_VERSION) {
    return {
      ok: false,
      error: `Unsupported protocolVersion ${message.protocolVersion}; expected ${TEAM_PROTOCOL_VERSION}.`,
    };
  }

  if (typeof message.type !== "string" || !isValidTeamMessageType(message.type)) {
    return { ok: false, error: `Invalid message type: ${String(message.type ?? "")}` };
  }

  if (typeof message.from !== "string" || !message.from.trim()) {
    return { ok: false, error: "Missing or empty sender name." };
  }

  if (message.to !== undefined && (typeof message.to !== "string" || !message.to.trim())) {
    return { ok: false, error: "Invalid recipient name." };
  }

  if (typeof message.content !== "string") {
    return { ok: false, error: "Missing message content." };
  }

  if (typeof message.timestamp !== "number" || !Number.isFinite(message.timestamp)) {
    return { ok: false, error: "Missing or invalid timestamp." };
  }

  const requiredFields = REQUIRED_FIELDS_BY_TYPE[message.type as TeamMessageType] ?? [];
  for (const field of requiredFields) {
    const value = (message as unknown as Record<string, unknown>)[field as string];
    if (field === "approve") {
      if (typeof value !== "boolean") {
        return { ok: false, error: "Missing required boolean field: approve." };
      }
      continue;
    }

    if (typeof value !== "string" || !value.trim()) {
      return { ok: false, error: `Missing required field: ${String(field)}.` };
    }
  }

  if (message.protocolKind !== undefined) {
    if (typeof message.protocolKind !== "string" || !PROTOCOL_REQUEST_KINDS.includes(message.protocolKind)) {
      return { ok: false, error: `Invalid protocolKind: ${String(message.protocolKind ?? "")}` };
    }
  }
  if (message.requestId !== undefined && (typeof message.requestId !== "string" || !message.requestId.trim())) {
    return { ok: false, error: "Invalid requestId." };
  }
  if (message.subject !== undefined && typeof message.subject !== "string") {
    return { ok: false, error: "Invalid subject." };
  }
  if (message.feedback !== undefined && typeof message.feedback !== "string") {
    return { ok: false, error: "Invalid feedback." };
  }
  if (message.exitCode !== undefined && (!Number.isFinite(message.exitCode) || !Number.isInteger(message.exitCode))) {
    return { ok: false, error: "Invalid exitCode." };
  }
  if (message.executionId !== undefined && (typeof message.executionId !== "string" || !message.executionId.trim())) {
    return { ok: false, error: "Invalid executionId." };
  }
  if (message.executionStatus !== undefined && (typeof message.executionStatus !== "string" || !message.executionStatus.trim())) {
    return { ok: false, error: "Invalid executionStatus." };
  }
  if (message.executionProfile !== undefined && (typeof message.executionProfile !== "string" || !message.executionProfile.trim())) {
    return { ok: false, error: "Invalid executionProfile." };
  }
  if (message.taskId !== undefined && (!Number.isFinite(message.taskId) || !Number.isInteger(message.taskId))) {
    return { ok: false, error: "Invalid taskId." };
  }

  return { ok: true, message };
}

export function safeParseTeamMessageLine(line: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(line) as unknown };
  } catch (error) {
    return { ok: false, error: String((error as { message?: unknown }).message ?? error) };
  }
}

export function buildProtocolErrorMessage(error: string, raw: unknown): TeamMessageRecord {
  const rawPreview =
    typeof raw === "string"
      ? truncate(raw, MAX_PROTOCOL_ERROR_PREVIEW_CHARS)
      : truncate(safeStringify(raw), MAX_PROTOCOL_ERROR_PREVIEW_CHARS);

  return {
    protocolVersion: TEAM_PROTOCOL_VERSION,
    type: "message",
    from: "system",
    content: `Protocol error: ${error}\nRaw: ${rawPreview}`,
    timestamp: Date.now(),
  };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value ?? "");
  }
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...`;
}
