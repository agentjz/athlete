import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { SessionRecord, StoredMessage } from "../../types.js";
import { deriveAcceptanceState, normalizeAcceptanceState } from "../acceptance.js";
import { createEmptyCheckpoint, normalizeSessionCheckpoint } from "../checkpoint.js";
import { createEmptyRuntimeStats, normalizeSessionRuntimeStats } from "../runtimeMetrics.js";
import { createEmptyTaskState, deriveTaskState, normalizeSessionRecord as normalizeTaskStateSessionRecord } from "./taskState.js";
import { deriveTodoItems } from "./todos.js";
import { createEmptyVerificationState, normalizeSessionVerificationState } from "../verification/state.js";

export interface SessionStoreLike {
  create(cwd: string): Promise<SessionRecord>;
  save(session: SessionRecord): Promise<SessionRecord>;
  load(id: string): Promise<SessionRecord>;
  loadLatest(): Promise<SessionRecord | null>;
  list(limit?: number): Promise<SessionRecord[]>;
  appendMessages(session: SessionRecord, messages: StoredMessage[]): Promise<SessionRecord>;
}

export class SessionStore implements SessionStoreLike {
  constructor(private readonly sessionsDir: string) {}

  async create(cwd: string): Promise<SessionRecord> {
    return createSessionRecord(cwd);
  }

  async save(session: SessionRecord): Promise<SessionRecord> {
    const updated = prepareSessionRecord(session);
    await fs.mkdir(this.sessionsDir, { recursive: true });
    await fs.writeFile(this.getPath(updated.id), `${JSON.stringify(updated, null, 2)}\n`, "utf8");
    return updated;
  }

  async load(id: string): Promise<SessionRecord> {
    const raw = await fs.readFile(this.getPath(id), "utf8");
    return normalizeStoredSessionRecord(JSON.parse(raw) as SessionRecord);
  }

  async loadLatest(): Promise<SessionRecord | null> {
    const sessions = await this.list(1);
    return sessions[0] ?? null;
  }

  async list(limit = 20): Promise<SessionRecord[]> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
    const entries = await fs.readdir(this.sessionsDir, { withFileTypes: true });

    const sessions = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => {
          const raw = await fs.readFile(path.join(this.sessionsDir, entry.name), "utf8");
          return normalizeStoredSessionRecord(JSON.parse(raw) as SessionRecord);
        }),
    );

    return sessions
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit);
  }

  async appendMessages(session: SessionRecord, messages: StoredMessage[]): Promise<SessionRecord> {
    const next = prepareSessionRecord({
      ...session,
      messages: [...session.messages, ...messages],
    });
    return this.save(next);
  }

  private getPath(id: string): string {
    return path.join(this.sessionsDir, `${id}.json`);
  }
}

export class MemorySessionStore implements SessionStoreLike {
  private readonly sessions = new Map<string, SessionRecord>();

  async create(cwd: string): Promise<SessionRecord> {
    return createSessionRecord(cwd);
  }

  async save(session: SessionRecord): Promise<SessionRecord> {
    const prepared = prepareSessionRecord(session);
    this.sessions.set(prepared.id, prepared);
    return prepared;
  }

  async load(id: string): Promise<SessionRecord> {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Unknown session: ${id}`);
    }

    return session;
  }

  async loadLatest(): Promise<SessionRecord | null> {
    const sessions = await this.list(1);
    return sessions[0] ?? null;
  }

  async list(limit = 20): Promise<SessionRecord[]> {
    return [...this.sessions.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit);
  }

  async appendMessages(session: SessionRecord, messages: StoredMessage[]): Promise<SessionRecord> {
    return this.save({
      ...session,
      messages: [...session.messages, ...messages],
    });
  }
}

export async function createSessionRecord(cwd: string): Promise<SessionRecord> {
  const timestamp = new Date().toISOString();
  return prepareSessionRecord({
    id: createSessionId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    cwd,
    messageCount: 0,
    messages: [],
    todoItems: [],
    taskState: createEmptyTaskState(timestamp),
    checkpoint: createEmptyCheckpoint(timestamp),
    verificationState: createEmptyVerificationState(timestamp),
    runtimeStats: createEmptyRuntimeStats(timestamp),
  });
}

function prepareSessionRecord(session: SessionRecord): SessionRecord {
  const normalizedMessages = Array.isArray(session.messages) ? session.messages : [];
  const verificationNormalized = normalizeSessionVerificationState(session).verificationState;
  const prepared = {
    ...session,
    updatedAt: new Date().toISOString(),
    title: session.title ?? deriveSessionTitle(normalizedMessages),
    messageCount: normalizedMessages.length,
    messages: normalizedMessages,
    todoItems: deriveTodoItems(normalizedMessages, session.todoItems ?? []),
    taskState: deriveTaskState(normalizedMessages, session.taskState),
    verificationState: verificationNormalized,
    acceptanceState: normalizeAcceptanceState(
      deriveAcceptanceState(normalizedMessages, session.acceptanceState),
    ),
  };

  return normalizeSessionRuntimeStats(normalizeSessionCheckpoint(prepared));
}

function normalizeStoredSessionRecord(session: SessionRecord): SessionRecord {
  const normalized = normalizeSessionRuntimeStats(normalizeSessionCheckpoint(
    normalizeSessionVerificationState(normalizeTaskStateSessionRecord(session)),
  ));
  return {
    ...normalized,
    todoItems: deriveTodoItems(normalized.messages ?? [], normalized.todoItems ?? []),
    acceptanceState: normalizeAcceptanceState(
      deriveAcceptanceState(normalized.messages ?? [], normalized.acceptanceState),
    ),
  };
}

function createSessionId(): string {
  const date = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const random = crypto.randomUUID().slice(0, 8);
  return `${date}-${random}`;
}

function deriveSessionTitle(messages: StoredMessage[]): string | undefined {
  const firstUserMessage = messages.find((message) => message.role === "user" && message.content);
  if (!firstUserMessage?.content) {
    return undefined;
  }

  const normalized = firstUserMessage.content.replace(/\s+/g, " ").trim();
  return normalized.slice(0, 80);
}
