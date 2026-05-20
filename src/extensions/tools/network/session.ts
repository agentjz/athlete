import path from "node:path";

import { ensureExtensionDir, readJsonFile, writeJsonFile } from "../../shared.js";

export interface HttpSessionRecord {
  id: string;
  baseUrl?: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  cookies: Record<string, string>;
  token?: string;
  createdAt: string;
  updatedAt: string;
}

export async function listHttpSessions(rootDir: string): Promise<HttpSessionRecord[]> {
  const state = await readJsonFile<{ sessions: HttpSessionRecord[] }>(await sessionFile(rootDir), { sessions: [] });
  return Array.isArray(state.sessions) ? state.sessions.map(normalizeSession) : [];
}

export async function getHttpSession(rootDir: string, id: string): Promise<HttpSessionRecord | null> {
  return (await listHttpSessions(rootDir)).find((session) => session.id === id) ?? null;
}

export async function putHttpSession(rootDir: string, session: HttpSessionRecord): Promise<string> {
  const sessions = (await listHttpSessions(rootDir)).filter((entry) => entry.id !== session.id);
  sessions.push(normalizeSession(session));
  const filePath = await sessionFile(rootDir);
  await writeJsonFile(filePath, { sessions });
  return filePath;
}

export async function deleteHttpSession(rootDir: string, id: string): Promise<boolean> {
  const sessions = await listHttpSessions(rootDir);
  const next = sessions.filter((session) => session.id !== id);
  await writeJsonFile(await sessionFile(rootDir), { sessions: next });
  return next.length !== sessions.length;
}

export async function getHttpSessionStateFile(rootDir: string): Promise<string> {
  return sessionFile(rootDir);
}

async function sessionFile(rootDir: string): Promise<string> {
  return path.join(await ensureExtensionDir(rootDir, "network"), "http-sessions.json");
}

function normalizeSession(value: HttpSessionRecord): HttpSessionRecord {
  return {
    id: String(value.id),
    baseUrl: typeof value.baseUrl === "string" ? value.baseUrl : undefined,
    headers: value.headers && typeof value.headers === "object" ? value.headers : {},
    query: value.query && typeof value.query === "object" ? value.query : {},
    cookies: value.cookies && typeof value.cookies === "object" ? value.cookies : {},
    token: typeof value.token === "string" ? value.token : undefined,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
  };
}
