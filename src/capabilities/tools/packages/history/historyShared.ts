import fs from "node:fs/promises";
import path from "node:path";

import { SessionStore } from "../../../../agent/session/store.js";
import { getProjectStatePaths } from "../../../../project/statePaths.js";
import type { RuntimeConfig, SessionRecord, StoredMessage } from "../../../../types.js";
import type { ToolContext } from "../../core/types.js";

export const DEFAULT_HISTORY_LIMIT = 20;
export const MAX_HISTORY_LIMIT = 200;
export const DEFAULT_MESSAGE_CHARS = 1_200;
export const MAX_MESSAGE_CHARS = 12_000;

export interface MessageSnapshot {
  index: number;
  role: StoredMessage["role"];
  name?: string;
  createdAt: string;
  content?: string | null;
  contentTruncated?: boolean;
  toolCallId?: string;
  toolCalls?: StoredMessage["tool_calls"];
  externalizedToolResult?: StoredMessage["externalizedToolResult"];
}

export function createSessionStore(config: Pick<RuntimeConfig, "paths">): SessionStore {
  return new SessionStore(config.paths.sessionsDir);
}

export function clampLimit(value: unknown, fallback = DEFAULT_HISTORY_LIMIT): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(MAX_HISTORY_LIMIT, Math.trunc(value)));
}

export function clampMessageChars(value: unknown, fallback = DEFAULT_MESSAGE_CHARS): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(200, Math.min(MAX_MESSAGE_CHARS, Math.trunc(value)));
}

export function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function summarizeSession(session: SessionRecord): Record<string, unknown> {
  return {
    id: session.id,
    cwd: session.cwd,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
    latestUserInput: truncateOneLine(readLatestUserInput(session.messages) ?? "", 240) || undefined,
    latestAssistantFinalOutput: truncateOneLine(readLatestAssistantFinalOutput(session.messages) ?? "", 320) || undefined,
    externalizedToolResultCount: session.messages.filter((message) => message.externalizedToolResult).length,
  };
}

export function messageToSnapshot(
  message: StoredMessage,
  index: number,
  options: {
    includeToolPayloads?: boolean;
    maxChars?: number;
  } = {},
): MessageSnapshot {
  const maxChars = options.maxChars ?? DEFAULT_MESSAGE_CHARS;
  const hideExternalizedPayload =
    message.role === "tool" &&
    message.externalizedToolResult &&
    options.includeToolPayloads !== true;
  const rawContent = hideExternalizedPayload
    ? message.externalizedToolResult?.preview ?? null
    : message.content;
  const content = rawContent === null ? null : truncate(rawContent ?? "", maxChars);

  return {
    index,
    role: message.role,
    name: message.name,
    createdAt: message.createdAt,
    content,
    contentTruncated: typeof rawContent === "string" && rawContent.length > maxChars,
    toolCallId: message.tool_call_id,
    toolCalls: message.tool_calls,
    externalizedToolResult: message.externalizedToolResult,
  };
}

export function readLatestAssistantFinalOutput(messages: StoredMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant" || message.tool_calls?.length) {
      continue;
    }

    const content = normalizeText(message.content);
    if (content) {
      return content;
    }
  }

  return undefined;
}

export function readLatestUserInput(messages: StoredMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") {
      continue;
    }

    const content = normalizeText(message.content);
    if (content) {
      return content;
    }
  }

  return undefined;
}

export function buildSearchText(message: StoredMessage): string {
  return [
    message.role,
    message.name,
    message.content,
    message.tool_call_id,
    message.externalizedToolResult?.preview,
    message.externalizedToolResult?.storagePath,
    message.tool_calls ? JSON.stringify(message.tool_calls) : undefined,
  ].filter((value): value is string => typeof value === "string" && value.length > 0).join("\n");
}

export function buildMatchPreview(text: string, query: string, caseSensitive: boolean): string {
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const index = haystack.indexOf(needle);
  if (index < 0) {
    return truncateOneLine(text, 320);
  }

  const start = Math.max(0, index - 120);
  const end = Math.min(text.length, index + query.length + 180);
  return `${start > 0 ? "..." : ""}${truncateOneLine(text.slice(start, end), 340)}${end < text.length ? "..." : ""}`;
}

export async function readProjectStateTextFile(
  context: ToolContext,
  requestedPath: string,
  maxChars: number,
): Promise<{
  absolutePath: string;
  storagePath: string;
  content: string;
  truncated: boolean;
  size: number;
}> {
  const stateRoot = path.resolve(context.projectContext.stateRootDir);
  const absolutePath = resolveInside(stateRoot, requestedPath);
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile()) {
    throw new Error(`History artifact is not a file: ${requestedPath}`);
  }
  const raw = await fs.readFile(absolutePath, "utf8");
  return {
    absolutePath,
    storagePath: path.relative(stateRoot, absolutePath),
    content: truncate(raw, maxChars),
    truncated: raw.length > maxChars,
    size: stat.size,
  };
}

export function resolveToolArtifactPathFromMessage(session: SessionRecord, messageIndex: number): string {
  const message = session.messages[messageIndex];
  const storagePath = message?.externalizedToolResult?.storagePath;
  if (!storagePath) {
    throw new Error(`Session ${session.id} message ${messageIndex} does not reference an externalized tool result.`);
  }

  return storagePath;
}

export async function listObservabilityEventFiles(context: ToolContext): Promise<string[]> {
  const eventsDir = getProjectStatePaths(context.projectContext.stateRootDir).observabilityEventsDir;
  const entries = await fs.readdir(eventsDir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => path.join(eventsDir, entry.name))
    .sort();
}

export function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`;
}

export function truncateOneLine(value: string, maxChars: number): string {
  return truncate(value.replace(/\s+/g, " ").trim(), maxChars);
}

function resolveInside(baseDir: string, requestedPath: string): string {
  const absolutePath = path.isAbsolute(requestedPath)
    ? path.resolve(requestedPath)
    : path.resolve(baseDir, requestedPath);
  if (absolutePath !== baseDir && !absolutePath.startsWith(`${baseDir}${path.sep}`)) {
    throw new Error(`History artifact path is outside the project state root: ${requestedPath}`);
  }

  return absolutePath;
}

function normalizeText(value: string | null | undefined): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}
