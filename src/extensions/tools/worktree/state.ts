import path from "node:path";

import { ensureExtensionDir, readJsonFile, writeJsonFile } from "../../shared.js";

export interface WorktreeEventRecord {
  at: string;
  event: string;
  path: string;
  details?: Record<string, unknown>;
}

export interface WorktreeState {
  schemaVersion: 1;
  keptPaths: string[];
  events: WorktreeEventRecord[];
}

export async function readWorktreeState(rootDir: string): Promise<WorktreeState> {
  return normalizeWorktreeState(await readJsonFile(await stateFile(rootDir), {
    schemaVersion: 1,
    keptPaths: [],
    events: [],
  }));
}

export async function writeWorktreeState(rootDir: string, state: WorktreeState): Promise<string> {
  const filePath = await stateFile(rootDir);
  await writeJsonFile(filePath, normalizeWorktreeState(state));
  return filePath;
}

export async function recordWorktreeEvent(
  rootDir: string,
  event: Omit<WorktreeEventRecord, "at">,
): Promise<string> {
  const state = await readWorktreeState(rootDir);
  state.events.push({
    at: new Date().toISOString(),
    ...event,
  });
  state.events = state.events.slice(-200);
  return writeWorktreeState(rootDir, state);
}

async function stateFile(rootDir: string): Promise<string> {
  return path.join(await ensureExtensionDir(rootDir, "worktree"), "state.json");
}

function normalizeWorktreeState(value: WorktreeState): WorktreeState {
  return {
    schemaVersion: 1,
    keptPaths: Array.isArray(value.keptPaths) ? value.keptPaths.map(String) : [],
    events: Array.isArray(value.events) ? value.events.map(normalizeEvent) : [],
  };
}

function normalizeEvent(value: WorktreeEventRecord): WorktreeEventRecord {
  return {
    at: typeof value.at === "string" ? value.at : new Date(0).toISOString(),
    event: typeof value.event === "string" ? value.event : "unknown",
    path: typeof value.path === "string" ? value.path : "",
    details: value.details && typeof value.details === "object" ? value.details : undefined,
  };
}
