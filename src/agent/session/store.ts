import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { SessionRecord, StoredMessage } from "../../types.js";
import { createEmptyCheckpoint } from "../checkpoint.js";
import { createEmptyRuntimeStats } from "../runtimeMetrics.js";
import { createEmptyTaskState } from "./taskState.js";
import { createEmptyVerificationState } from "../verification/state.js";
import { createEmptySessionDiff } from "./sessionDiff.js";
import { createSessionNotFoundError } from "./errors.js";
import { parseSessionSnapshot, prepareSessionRecordForSave, serializeSessionSnapshot } from "./snapshot.js";

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
    await fs.mkdir(this.sessionsDir, { recursive: true });
    const entries = await fs.readdir(this.sessionsDir, { withFileTypes: true });

    const sessions = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => {
          const sessionPath = path.join(this.sessionsDir, entry.name);
          const raw = await fs.readFile(sessionPath, "utf8");
          return parseSessionSnapshot(raw, sessionPath);
        }),
    );

    return sessions
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit);
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

export class MemorySessionStore implements SessionStoreLike {
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
      throw createSessionNotFoundError(id, `memory:${id}`);
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
  return prepareSessionRecordForSave({
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
    sessionDiff: createEmptySessionDiff(timestamp),
  });
}

function createSessionId(): string {
  const date = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const random = crypto.randomUUID().slice(0, 8);
  return `${date}-${random}`;
}
