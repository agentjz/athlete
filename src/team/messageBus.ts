import fs from "node:fs/promises";
import path from "node:path";

import { ensureProjectStateDirectories, getProjectStatePaths } from "../project/statePaths.js";
import { PROTOCOL_REQUEST_KINDS, TEAM_PROTOCOL_VERSION } from "./types.js";
import type { TeamMessageRecord, TeamMessageType } from "./types.js";

const VALID_MESSAGE_TYPES: TeamMessageType[] = [
  "message",
  "broadcast",
  "background_result",
  "protocol_request",
  "protocol_response",
];
const REQUIRED_FIELDS_BY_TYPE: Record<TeamMessageType, readonly (keyof TeamMessageRecord)[]> = {
  message: [],
  broadcast: [],
  background_result: ["jobId", "jobStatus"],
  protocol_request: ["protocolKind", "requestId"],
  protocol_response: ["protocolKind", "requestId", "approve"],
};
const MAX_PROTOCOL_ERROR_PREVIEW_CHARS = 800;

export class MessageBus {
  constructor(private readonly rootDir: string) {}

  async send(
    sender: string,
    to: string,
    content: string,
    type: TeamMessageType = "message",
    extra: Partial<TeamMessageRecord> = {},
  ): Promise<TeamMessageRecord> {
    if (!VALID_MESSAGE_TYPES.includes(type)) {
      throw new Error(`Invalid message type: ${type}`);
    }

    const normalizedTo = normalizeName(to);
    if (!normalizedTo) {
      throw new Error("Target teammate name is required.");
    }

    const paths = await ensureProjectStateDirectories(this.rootDir);
    const message: TeamMessageRecord = {
      protocolVersion: TEAM_PROTOCOL_VERSION,
      type,
      from: normalizeName(sender) || "lead",
      to: normalizedTo,
      content: String(content ?? ""),
      timestamp: Date.now(),
      protocolKind: typeof extra.protocolKind === "string" ? extra.protocolKind : undefined,
      requestId: typeof extra.requestId === "string" ? extra.requestId : undefined,
      subject: typeof extra.subject === "string" ? extra.subject : undefined,
      approve: typeof extra.approve === "boolean" ? extra.approve : undefined,
      feedback: typeof extra.feedback === "string" ? extra.feedback : undefined,
      jobId: typeof extra.jobId === "string" ? extra.jobId : undefined,
      jobStatus: typeof extra.jobStatus === "string" ? extra.jobStatus : undefined,
      exitCode: typeof extra.exitCode === "number" && Number.isFinite(extra.exitCode) ? Math.trunc(extra.exitCode) : undefined,
    };
    const validation = validateTeamMessage(message);
    if (!validation.ok) {
      throw new Error(`Invalid team protocol message: ${validation.error}`);
    }

    const inboxPath = path.join(paths.inboxDir, `${normalizedTo}.jsonl`);
    await fs.appendFile(paths.messageLogFile, `${JSON.stringify(message)}\n`, "utf8");
    await fs.appendFile(inboxPath, `${JSON.stringify(message)}\n`, "utf8");
    return message;
  }

  async readInbox(name: string): Promise<TeamMessageRecord[]> {
    const inboxPath = path.join(getProjectStatePaths(this.rootDir).inboxDir, `${normalizeName(name) || "lead"}.jsonl`);
    const messages = await this.peekInbox(name);
    if (messages.length === 0) {
      return [];
    }

    await fs.writeFile(inboxPath, "", "utf8");
    return messages;
  }

  async peekInbox(name: string): Promise<TeamMessageRecord[]> {
    const inboxPath = path.join(getProjectStatePaths(this.rootDir).inboxDir, `${normalizeName(name) || "lead"}.jsonl`);
    try {
      const raw = await fs.readFile(inboxPath, "utf8");
      const lines = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const messages: TeamMessageRecord[] = [];

      for (const line of lines) {
        const parsed = safeParseJson(line);
        if (!parsed.ok) {
          messages.push(buildProtocolErrorMessage(`Invalid JSON: ${parsed.error}`, line));
          continue;
        }

        const validation = validateTeamMessage(parsed.value);
        if (!validation.ok) {
          messages.push(buildProtocolErrorMessage(validation.error, parsed.value));
          continue;
        }

        messages.push(validation.message);
      }

      return messages;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async broadcast(sender: string, content: string, recipients: string[]): Promise<number> {
    let count = 0;
    for (const recipient of recipients) {
      if (normalizeName(recipient) === normalizeName(sender)) {
        continue;
      }

      await this.send(sender, recipient, content, "broadcast");
      count += 1;
    }

    return count;
  }
}

function normalizeName(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, "-").trim();
}

function validateTeamMessage(
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

  if (typeof message.type !== "string" || !VALID_MESSAGE_TYPES.includes(message.type as TeamMessageType)) {
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
  if (message.jobId !== undefined && (typeof message.jobId !== "string" || !message.jobId.trim())) {
    return { ok: false, error: "Invalid jobId." };
  }
  if (message.jobStatus !== undefined && (typeof message.jobStatus !== "string" || !message.jobStatus.trim())) {
    return { ok: false, error: "Invalid jobStatus." };
  }
  if (message.exitCode !== undefined && (!Number.isFinite(message.exitCode) || !Number.isInteger(message.exitCode))) {
    return { ok: false, error: "Invalid exitCode." };
  }

  return { ok: true, message };
}

function buildProtocolErrorMessage(error: string, raw: unknown): TeamMessageRecord {
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

function safeParseJson(line: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(line) as unknown };
  } catch (error) {
    return { ok: false, error: String((error as { message?: unknown }).message ?? error) };
  }
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
