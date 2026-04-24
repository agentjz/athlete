import type {
  ExternalizedToolResultReference,
  SessionRecord,
  StoredMessage,
  TodoItem,
  ToolCallRecord,
} from "../../types.js";
import { deriveAcceptanceState, normalizeAcceptanceState } from "../acceptance.js";
import { normalizeSessionCheckpoint } from "../checkpoint.js";
import { normalizeSessionRuntimeStats } from "../runtimeMetrics.js";
import { createEmptyVerificationState, normalizeSessionVerificationState } from "../verification/state.js";
import { normalizeSessionDiffState } from "./sessionDiff.js";
import {
  createInvalidSessionJsonError,
  createSessionCorruptError,
  createUnsupportedSessionSchemaError,
} from "./errors.js";
import { deriveTaskState, normalizeSessionRecord as normalizeTaskStateSessionRecord } from "./taskState.js";
import { deriveTodoItems, normalizeTodoItems } from "./todos.js";

const CURRENT_SESSION_SCHEMA_VERSION = 1;
const OFFICIAL_SESSION_KEYS = new Set([
  "schemaVersion",
  "id",
  "createdAt",
  "updatedAt",
  "cwd",
  "title",
  "messageCount",
  "messages",
  "todoItems",
  "taskState",
  "checkpoint",
  "verificationState",
  "acceptanceState",
  "runtimeStats",
  "sessionDiff",
]);

type SessionSnapshotCandidate = Partial<SessionRecord> & {
  schemaVersion?: unknown;
};

export interface ParsedSessionSnapshot {
  session: SessionRecord;
  shouldRewrite: boolean;
}

export function serializeSessionSnapshot(session: SessionRecord): string {
  return `${JSON.stringify({
    schemaVersion: CURRENT_SESSION_SCHEMA_VERSION,
    ...session,
  }, null, 2)}\n`;
}

export function parseSessionSnapshot(raw: string, sessionPath: string): ParsedSessionSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw createInvalidSessionJsonError(sessionPath, error);
    }
    throw error;
  }

  const record = expectRecord(parsed, sessionPath, "Session snapshot");
  const schemaVersion = record.schemaVersion;
  const versionless = schemaVersion === undefined;
  if (!versionless && schemaVersion !== CURRENT_SESSION_SCHEMA_VERSION) {
    throw createUnsupportedSessionSchemaError(sessionPath, schemaVersion, CURRENT_SESSION_SCHEMA_VERSION);
  }

  const candidate: SessionSnapshotCandidate = {
    id: readRequiredString(record, "id", sessionPath),
    createdAt: readRequiredString(record, "createdAt", sessionPath),
    updatedAt: readRequiredString(record, "updatedAt", sessionPath),
    cwd: readRequiredString(record, "cwd", sessionPath),
    title: readOptionalString(record.title, "title", sessionPath),
    messageCount: typeof record.messageCount === "number" ? Math.trunc(record.messageCount) : 0,
    messages: readMessages(record.messages, sessionPath),
    todoItems: readTodoItems(record.todoItems, sessionPath),
    taskState: readOptionalObject(record.taskState, "taskState", sessionPath) as SessionRecord["taskState"],
    checkpoint: readOptionalObject(record.checkpoint, "checkpoint", sessionPath) as SessionRecord["checkpoint"],
    verificationState: readOptionalObject(record.verificationState, "verificationState", sessionPath) as SessionRecord["verificationState"],
    acceptanceState: readOptionalObject(record.acceptanceState, "acceptanceState", sessionPath) as SessionRecord["acceptanceState"],
    runtimeStats: readOptionalObject(record.runtimeStats, "runtimeStats", sessionPath) as SessionRecord["runtimeStats"],
    sessionDiff: readOptionalObject(record.sessionDiff, "sessionDiff", sessionPath) as SessionRecord["sessionDiff"],
  };

  return {
    session: normalizeLoadedSessionRecord(candidate as SessionRecord),
    shouldRewrite: versionless || hasLegacySessionKeys(record),
  };
}

export function prepareSessionRecordForSave(session: SessionRecord): SessionRecord {
  const normalizedMessages = Array.isArray(session.messages) ? session.messages : [];
  const verificationState = normalizeSessionVerificationState(session).verificationState ?? createEmptyVerificationState();
  const prepared = {
    ...session,
    updatedAt: new Date().toISOString(),
    title: session.title ?? deriveSessionTitle(normalizedMessages),
    messageCount: normalizedMessages.length,
    messages: normalizedMessages,
    todoItems: deriveTodoItems(normalizedMessages, session.todoItems ?? []),
    taskState: deriveTaskState(normalizedMessages, session.taskState),
    verificationState,
    acceptanceState: normalizeAcceptanceState(
      deriveAcceptanceState(normalizedMessages, session.acceptanceState),
    ),
  };

  return normalizeSessionDiffState(normalizeSessionRuntimeStats(normalizeSessionCheckpoint(prepared)));
}

export function normalizeLoadedSessionRecord(session: SessionRecord): SessionRecord {
  const normalized = normalizeSessionDiffState(normalizeSessionRuntimeStats(normalizeSessionCheckpoint(
    normalizeSessionVerificationState(normalizeTaskStateSessionRecord(session)),
  )));

  return {
    ...normalized,
    todoItems: deriveTodoItems(normalized.messages ?? [], normalizeTodoItems(session.todoItems)),
    acceptanceState: normalizeAcceptanceState(
      deriveAcceptanceState(normalized.messages ?? [], normalized.acceptanceState),
    ),
  };
}

function hasLegacySessionKeys(record: Record<string, unknown>): boolean {
  return Object.keys(record).some((key) => !OFFICIAL_SESSION_KEYS.has(key));
}

function readMessages(value: unknown, sessionPath: string): StoredMessage[] {
  if (!Array.isArray(value)) {
    throw createSessionCorruptError(sessionPath, "messages must be an array");
  }

  return value.map((entry, index) => readMessage(entry, index, sessionPath));
}

function readMessage(value: unknown, index: number, sessionPath: string): StoredMessage {
  const record = expectRecord(value, sessionPath, `messages[${index}]`);
  const role = readRequiredString(record, "role", sessionPath, `messages[${index}]`);
  if (role !== "system" && role !== "user" && role !== "assistant" && role !== "tool") {
    throw createSessionCorruptError(sessionPath, `messages[${index}].role must be one of system|user|assistant|tool`);
  }

  return {
    role,
    content: readMessageContent(record.content, sessionPath, `messages[${index}]`),
    name: readOptionalString(record.name, "name", sessionPath, `messages[${index}]`),
    tool_call_id: readOptionalString(record.tool_call_id, "tool_call_id", sessionPath, `messages[${index}]`),
    tool_calls: readToolCalls(record.tool_calls, sessionPath, index),
    reasoningContent: readOptionalString(record.reasoningContent, "reasoningContent", sessionPath, `messages[${index}]`),
    externalizedToolResult: readExternalizedToolResult(record.externalizedToolResult, sessionPath, index),
    createdAt: readRequiredString(record, "createdAt", sessionPath, `messages[${index}]`),
  };
}

function readMessageContent(
  value: unknown,
  sessionPath: string,
  scope: string,
): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw createSessionCorruptError(sessionPath, `${scope}.content must be a string or null`);
  }

  return value;
}

function readToolCalls(value: unknown, sessionPath: string, index: number): ToolCallRecord[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw createSessionCorruptError(sessionPath, `messages[${index}].tool_calls must be an array`);
  }

  return value.map((entry, toolIndex) => {
    const record = expectRecord(entry, sessionPath, `messages[${index}].tool_calls[${toolIndex}]`);
    const type = readRequiredString(record, "type", sessionPath, `messages[${index}].tool_calls[${toolIndex}]`);
    if (type !== "function") {
      throw createSessionCorruptError(sessionPath, `messages[${index}].tool_calls[${toolIndex}].type must be 'function'`);
    }
    const fn = readOptionalObject(record.function, "function", sessionPath, `messages[${index}].tool_calls[${toolIndex}]`);
    if (!fn) {
      throw createSessionCorruptError(sessionPath, `messages[${index}].tool_calls[${toolIndex}].function is required`);
    }
    return {
      id: readRequiredString(record, "id", sessionPath, `messages[${index}].tool_calls[${toolIndex}]`),
      type,
      function: {
        name: readRequiredString(fn, "name", sessionPath, `messages[${index}].tool_calls[${toolIndex}].function`),
        arguments: readRequiredString(fn, "arguments", sessionPath, `messages[${index}].tool_calls[${toolIndex}].function`),
      },
    };
  });
}

function readExternalizedToolResult(
  value: unknown,
  sessionPath: string,
  index: number,
): ExternalizedToolResultReference | undefined {
  const record = readOptionalObject(value, "externalizedToolResult", sessionPath, `messages[${index}]`);
  if (!record) {
    return undefined;
  }

  const scope = readRequiredString(record, "scope", sessionPath, `messages[${index}].externalizedToolResult`);
  if (scope !== "project_state_root") {
    throw createSessionCorruptError(sessionPath, `messages[${index}].externalizedToolResult.scope must be 'project_state_root'`);
  }

  return {
    scope,
    storagePath: readRequiredString(record, "storagePath", sessionPath, `messages[${index}].externalizedToolResult`),
    byteLength: readRequiredNumber(record, "byteLength", sessionPath, `messages[${index}].externalizedToolResult`),
    charLength: readRequiredNumber(record, "charLength", sessionPath, `messages[${index}].externalizedToolResult`),
    preview: readRequiredString(record, "preview", sessionPath, `messages[${index}].externalizedToolResult`),
    sha256: readRequiredString(record, "sha256", sessionPath, `messages[${index}].externalizedToolResult`),
  };
}

function readTodoItems(value: unknown, sessionPath: string): TodoItem[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw createSessionCorruptError(sessionPath, "todoItems must be an array when present");
  }

  return normalizeTodoItems(value);
}

function readOptionalObject(
  value: unknown,
  fieldName: string,
  sessionPath: string,
  scope?: string,
): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectRecord(value, sessionPath, scope ? `${scope}.${fieldName}` : fieldName);
}

function expectRecord(
  value: unknown,
  sessionPath: string,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createSessionCorruptError(sessionPath, `${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function readRequiredString(
  record: Record<string, unknown>,
  key: string,
  sessionPath: string,
  scope?: string,
): string {
  const value = readOptionalString(record[key], key, sessionPath, scope);
  if (!value) {
    throw createSessionCorruptError(sessionPath, `${scope ? `${scope}.` : ""}${key} is required`);
  }
  return value;
}

function readOptionalString(
  value: unknown,
  key: string,
  sessionPath: string,
  scope?: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw createSessionCorruptError(sessionPath, `${scope ? `${scope}.` : ""}${key} must be a string`);
  }

  return value;
}

function readRequiredNumber(
  record: Record<string, unknown>,
  key: string,
  sessionPath: string,
  scope?: string,
): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw createSessionCorruptError(sessionPath, `${scope ? `${scope}.` : ""}${key} must be a finite number`);
  }

  return Math.trunc(value);
}

function deriveSessionTitle(messages: StoredMessage[]): string | undefined {
  const firstUserMessage = messages.find((message) => message.role === "user" && message.content);
  if (!firstUserMessage?.content) {
    return undefined;
  }

  const normalized = firstUserMessage.content.replace(/\s+/g, " ").trim();
  return normalized.slice(0, 80);
}

export { CURRENT_SESSION_SCHEMA_VERSION };
