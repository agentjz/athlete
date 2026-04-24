import fs from "node:fs/promises";
import path from "node:path";

import { getProjectStatePaths } from "../../project/statePaths.js";

export interface HttpSessionRecord {
  id: string;
  baseUrl?: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  cookies: Record<string, string>;
  token?: string;
  persist: boolean;
  createdAt: string;
  updatedAt: string;
}

interface HttpSessionStoreDocument {
  version: 1;
  updatedAt: string;
  sessions: HttpSessionRecord[];
}

const SESSION_STORE_BY_ROOT = new Map<string, Map<string, HttpSessionRecord>>();
const PERSISTENCE_FILENAME = "http-sessions.json";

export async function listHttpSessions(stateRootDir: string): Promise<HttpSessionRecord[]> {
  const sessions = await readAllSessions(stateRootDir);
  return sessions.map(cloneSession).sort((left, right) => left.id.localeCompare(right.id));
}

export async function getHttpSession(
  stateRootDir: string,
  sessionId: string,
): Promise<HttpSessionRecord | null> {
  const sessions = await readAllSessions(stateRootDir);
  const target = sessions.find((session) => session.id === sessionId);
  return target ? cloneSession(target) : null;
}

export async function putHttpSession(
  stateRootDir: string,
  session: HttpSessionRecord,
): Promise<HttpSessionRecord> {
  const rootKey = normalizeRootKey(stateRootDir);
  const byId = SESSION_STORE_BY_ROOT.get(rootKey) ?? new Map<string, HttpSessionRecord>();
  byId.set(session.id, cloneSession(session));
  SESSION_STORE_BY_ROOT.set(rootKey, byId);
  await flushPersistedSessions(stateRootDir, byId);
  return cloneSession(session);
}

export async function deleteHttpSession(
  stateRootDir: string,
  sessionId: string,
): Promise<boolean> {
  const rootKey = normalizeRootKey(stateRootDir);
  const byId = SESSION_STORE_BY_ROOT.get(rootKey) ?? await loadSessionsIntoMemory(stateRootDir);
  const removed = byId.delete(sessionId);
  await flushPersistedSessions(stateRootDir, byId);
  return removed;
}

function normalizeRootKey(rootDir: string): string {
  return path.resolve(rootDir);
}

async function readAllSessions(stateRootDir: string): Promise<HttpSessionRecord[]> {
  const byId = await loadSessionsIntoMemory(stateRootDir);
  return [...byId.values()].map(cloneSession);
}

async function loadSessionsIntoMemory(stateRootDir: string): Promise<Map<string, HttpSessionRecord>> {
  const rootKey = normalizeRootKey(stateRootDir);
  const existing = SESSION_STORE_BY_ROOT.get(rootKey);
  if (existing) {
    return existing;
  }

  const loaded = new Map<string, HttpSessionRecord>();
  const persisted = await readPersistedSessions(stateRootDir);
  for (const session of persisted) {
    loaded.set(session.id, cloneSession(session));
  }
  SESSION_STORE_BY_ROOT.set(rootKey, loaded);
  return loaded;
}

async function readPersistedSessions(stateRootDir: string): Promise<HttpSessionRecord[]> {
  const filePath = getSessionStoreFilePath(stateRootDir);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as HttpSessionStoreDocument;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.sessions)) {
      return [];
    }

    return parsed.sessions
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => normalizePersistedSession(entry));
  } catch {
    return [];
  }
}

function normalizePersistedSession(entry: HttpSessionRecord): HttpSessionRecord {
  return {
    id: String(entry.id),
    baseUrl: normalizeOptionalText(entry.baseUrl),
    headers: normalizeStringMap(entry.headers),
    query: normalizeStringMap(entry.query),
    cookies: normalizeStringMap(entry.cookies),
    token: normalizeOptionalText(entry.token),
    persist: true,
    createdAt: normalizeRequiredTimestamp(entry.createdAt),
    updatedAt: normalizeRequiredTimestamp(entry.updatedAt),
  };
}

function normalizeRequiredTimestamp(value: unknown): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return new Date().toISOString();
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const normalized: Record<string, string> = {};
  for (const [key, raw] of Object.entries(record)) {
    if (typeof raw !== "string") {
      continue;
    }
    const normalizedKey = key.trim();
    const normalizedValue = raw.trim();
    if (!normalizedKey || !normalizedValue) {
      continue;
    }
    normalized[normalizedKey] = normalizedValue;
  }
  return normalized;
}

function getSessionStoreFilePath(stateRootDir: string): string {
  const statePaths = getProjectStatePaths(stateRootDir);
  return path.join(statePaths.deadmouseDir, "network", PERSISTENCE_FILENAME);
}

async function flushPersistedSessions(stateRootDir: string, byId: Map<string, HttpSessionRecord>): Promise<void> {
  const filePath = getSessionStoreFilePath(stateRootDir);
  const persistedSessions = [...byId.values()]
    .filter((session) => session.persist)
    .map((session) => ({
      ...cloneSession(session),
      persist: true,
    }));
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  if (persistedSessions.length === 0) {
    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          version: 1,
          updatedAt: new Date().toISOString(),
          sessions: [],
        } satisfies HttpSessionStoreDocument,
        null,
        2,
      ),
      "utf8",
    );
    return;
  }

  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        sessions: persistedSessions,
      } satisfies HttpSessionStoreDocument,
      null,
      2,
    ),
    "utf8",
  );
}

function cloneSession(session: HttpSessionRecord): HttpSessionRecord {
  return {
    ...session,
    headers: { ...session.headers },
    query: { ...session.query },
    cookies: { ...session.cookies },
  };
}
