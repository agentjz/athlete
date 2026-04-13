import fs from "node:fs/promises";

import { ensureProjectStateDirectories } from "../project/statePaths.js";
import type { WorktreeEventRecord, WorktreeStatus } from "./types.js";

export async function appendWorktreeEvent(rootDir: string, event: WorktreeEventRecord): Promise<void> {
  const paths = await ensureProjectStateDirectories(rootDir);
  await fs.appendFile(paths.worktreeEventsFile, `${JSON.stringify(event)}\n`, "utf8");
}

export async function readWorktreeEvents(rootDir: string, limit = 20): Promise<WorktreeEventRecord[]> {
  const paths = await ensureProjectStateDirectories(rootDir);
  try {
    const raw = await fs.readFile(paths.worktreeEventsFile, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as WorktreeEventRecord)
      .slice(-Math.max(1, Math.trunc(limit)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export function formatWorktreeMarker(status: WorktreeStatus): string {
  return status === "kept" ? "[k]" : status === "removed" ? "[x]" : "[>]";
}

export function readWorktreeError(error: unknown): string {
  return String((error as { all?: unknown; stderr?: unknown; message?: unknown }).all ??
    (error as { stderr?: unknown }).stderr ??
    (error as { message?: unknown }).message ??
    error);
}
