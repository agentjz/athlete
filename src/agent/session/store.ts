import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { SessionRecord, StoredMessage } from "../../types.js";
import { createEmptyCheckpoint } from "../checkpoint.js";
import { createEmptyTaskState } from "./taskState.js";
import { createEmptySessionDiff } from "./sessionDiff.js";
import { createSessionNotFoundError, SessionStoreError } from "./errors.js";
import { parseSessionSnapshot, prepareSessionRecordForSave, serializeSessionSnapshot } from "./snapshot.js";

export interface SkippedSessionSnapshot {
  path?: string;
  code: string;
  error: string;
}

export interface SessionStoreLike {
  create(cwd: string): Promise<SessionRecord>;
  save(session: SessionRecord): Promise<SessionRecord>;
  load(id: string): Promise<SessionRecord>;
  loadLatest(): Promise<SessionRecord | null>;
  list(limit?: number): Promise<SessionRecord[]>;
  listReadable?(limit?: number): Promise<{
    sessions: SessionRecord[];
    skipped: SkippedSessionSnapshot[];
  }>;
  appendMessages(session: SessionRecord, messages: StoredMessage[]): Promise<SessionRecord>;
}

export class SessionStore implements SessionStoreLike {
  constructor(private readonly sessionsDir: string) {}

  async create(cwd: string): Promise<SessionRecord> {
    return createSessionRecord(cwd);
  }

  async save(session: SessionRecord): Promise<SessionRecord> {
    const updated = prepareSessionRecordForSave(session);
    await fs.mkdir(this.sessionsDir, { recursive: true });
    await fs.writeFile(this.getPath(updated.id), serializeSessionSnapshot(updated), "utf8");
    return updated;
  }

  async load(id: string): Promise<SessionRecord> {
    const sessionPath = this.getPath(id);
    const raw = await this.readSnapshotFile(id, sessionPath);
    return parseSessionSnapshot(raw, sessionPath);
  }

  async loadLatest(): Promise<SessionRecord | null> {
    const sessions = await this.list(1);
    return sessions[0] ?? null;
  }

  async list(limit = 20): Promise<SessionRecord[]> {
    return (await this.listReadable(limit)).sessions;
  }

  async listReadable(limit = 20): Promise<{
    sessions: SessionRecord[];
    skipped: SkippedSessionSnapshot[];
  }> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
    const entries = await fs.readdir(this.sessionsDir, { withFileTypes: true });
    const sessions: SessionRecord[] = [];
    const skipped: SkippedSessionSnapshot[] = [];

    for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".json"))) {
      const sessionPath = path.join(this.sessionsDir, entry.name);
      try {
        const raw = await fs.readFile(sessionPath, "utf8");
        sessions.push(parseSessionSnapshot(raw, sessionPath));
      } catch (error) {
        skipped.push(toSkippedSessionSnapshot(error, sessionPath));
      }
    }

    return {
      sessions: sessions
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, limit),
      skipped,
    };
  }

  async appendMessages(session: SessionRecord, messages: StoredMessage[]): Promise<SessionRecord> {
    const next = {
      ...session,
      messages: [...session.messages, ...messages],
    };
    return this.save(next);
  }

  private getPath(id: string): string {
    return path.join(this.sessionsDir, `${id}.json`);
  }

  private async readSnapshotFile(id: string, sessionPath: string): Promise<string> {
    try {
      return await fs.readFile(sessionPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw createSessionNotFoundError(id, sessionPath, error);
      }
      throw error;
    }
  }
}

function toSkippedSessionSnapshot(error: unknown, fallbackPath?: string): SkippedSessionSnapshot {
  if (error instanceof SessionStoreError) {
    return {
      path: error.sessionPath ?? fallbackPath,
      code: error.code,
      error: error.message,
    };
  }

  return {
    path: fallbackPath,
    code: "SESSION_READ_FAILED",
    error: error instanceof Error ? error.message : String(error),
  };
}

export class InProcessSessionStore implements SessionStoreLike {
  private readonly sessions = new Map<string, SessionRecord>();

  async create(cwd: string): Promise<SessionRecord> {
    return createSessionRecord(cwd);
  }

  async save(session: SessionRecord): Promise<SessionRecord> {
    const prepared = prepareSessionRecordForSave(session);
    this.sessions.set(prepared.id, prepared);
    return prepared;
  }

  async load(id: string): Promise<SessionRecord> {
    const session = this.sessions.get(id);
    if (!session) {
      throw createSessionNotFoundError(id, `in-process:${id}`);
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

  async listReadable(limit = 20): Promise<{
    sessions: SessionRecord[];
    skipped: SkippedSessionSnapshot[];
  }> {
    return {
      sessions: await this.list(limit),
      skipped: [],
    };
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
  return prepareSessionRecordForSave({
    id: createSessionId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    cwd,
    messageCount: 0,
    messages: [],
    taskState: createEmptyTaskState(timestamp),
    checkpoint: createEmptyCheckpoint(timestamp),
    sessionDiff: createEmptySessionDiff(timestamp),
  });
}

function createSessionId(): string {
  const date = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const random = crypto.randomUUID().slice(0, 8);
  return `${date}-${random}`;
}
