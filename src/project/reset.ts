import fs from "node:fs/promises";
import path from "node:path";

import type { ChangeRecord, RuntimeConfig, SessionRecord } from "../types.js";
import { BackgroundJobStore } from "../execution/background.js";
import { resolveProjectRoots } from "../context/repoRoots.js";
import { TeamStore } from "../team/store.js";
import { terminateKnownProcesses } from "../utils/processControl.js";
import { getProjectStatePaths } from "./statePaths.js";
import { isSameOrDescendant, waitForRemovedPaths } from "./resetSupport.js";
import { WorktreeStore } from "../worktrees/store.js";

const PRESERVED_DEADMOUSE_ENTRIES = new Set([".env", ".env.example"]);

export interface ResetProjectRuntimeInput {
  cwd: string;
  config: Pick<RuntimeConfig, "paths">;
  currentSessionId?: string;
}

export interface ResetProjectRuntimeResult {
  rootDir: string;
  stateRootDir: string;
  removedSessionIds: string[];
  removedChangeIds: string[];
  removedWorktrees: string[];
  removedStateEntries: string[];
  preservedStateEntries: string[];
  terminatedPids: number[];
}

export async function resetProjectRuntime(input: ResetProjectRuntimeInput): Promise<ResetProjectRuntimeResult> {
  const roots = await resolveProjectRoots(input.cwd);
  const statePaths = getProjectStatePaths(roots.stateRootDir);
  const deadmouseDir = statePaths.deadmouseDir;

  const [worktrees, teamMembers, backgroundJobs] = await Promise.all([
    readTrackedWorktrees(roots.stateRootDir),
    new TeamStore(roots.stateRootDir).listMembers().catch(() => []),
    new BackgroundJobStore(roots.stateRootDir).list().catch(() => []),
  ]);

  const terminatedPids = await terminateKnownProcesses([
    ...teamMembers.map((member) => member.pid),
    ...backgroundJobs.map((job) => job.pid),
  ]);

  const removedWorktrees = await removeTrackedWorktrees(roots.stateRootDir, worktrees);
  const removedSessionIds = await removeProjectSessions({
    sessionsDir: input.config.paths.sessionsDir,
    stateRootDir: roots.stateRootDir,
    currentSessionId: input.currentSessionId,
  });
  await waitForRemovedPaths(removedSessionIds.map((sessionId) => path.join(input.config.paths.sessionsDir, `${sessionId}.json`)));
  const removedChangeIds = await removeProjectChanges({
    changesDir: input.config.paths.changesDir,
    stateRootDir: roots.stateRootDir,
    removedSessionIds,
  });
  const { removedEntries, preservedEntries } = await clearProjectDeadmouseDirectory(deadmouseDir);
  await waitForRemovedPaths(removedEntries.map((entry) => path.join(deadmouseDir, entry)));

  return {
    rootDir: roots.rootDir,
    stateRootDir: roots.stateRootDir,
    removedSessionIds,
    removedChangeIds,
    removedWorktrees,
    removedStateEntries: removedEntries,
    preservedStateEntries: preservedEntries,
    terminatedPids,
  };
}

async function readTrackedWorktrees(rootDir: string): Promise<Array<{ name: string; path: string; status?: string }>> {
  const records = await new WorktreeStore(rootDir).list().catch(() => []);
  return records.map((record) => ({
    name: record.name,
    path: record.path,
    status: record.status,
  }));
}

async function removeTrackedWorktrees(
  rootDir: string,
  worktrees: Array<{ name: string; path: string; status?: string }>,
): Promise<string[]> {
  const removed: string[] = [];
  const store = new WorktreeStore(rootDir);

  for (const worktree of worktrees) {
    if (!worktree.name || !worktree.path || worktree.status === "removed") {
      continue;
    }

    try {
      await store.remove(worktree.name, {
        force: true,
      });
    } catch {
      await fs.rm(worktree.path, { recursive: true, force: true }).catch(() => null);
    }

    removed.push(worktree.name);
  }

  return removed;
}

async function removeProjectSessions(input: {
  sessionsDir: string;
  stateRootDir: string;
  currentSessionId?: string;
}): Promise<string[]> {
  const removedIds: string[] = [];

  try {
    const entries = await fs.readdir(input.sessionsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }

      const sessionId = path.basename(entry.name, ".json");
      const absolutePath = path.join(input.sessionsDir, entry.name);
      const removeById = input.currentSessionId === sessionId;
      let removeByPath = false;

      if (!removeById) {
        const raw = await fs.readFile(absolutePath, "utf8");
        const parsed = JSON.parse(raw) as Pick<SessionRecord, "cwd">;
        removeByPath = await isSameOrDescendant(String(parsed.cwd ?? ""), input.stateRootDir);
      }

      if (!removeById && !removeByPath) {
        continue;
      }

      await fs.rm(absolutePath, { force: true });
      removedIds.push(sessionId);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return removedIds;
}

async function removeProjectChanges(input: {
  changesDir: string;
  stateRootDir: string;
  removedSessionIds: string[];
}): Promise<string[]> {
  const removedIds: string[] = [];
  const removedSessionIds = new Set(input.removedSessionIds);

  try {
    const entries = await fs.readdir(input.changesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }

      const changeId = path.basename(entry.name, ".json");
      const metadataPath = path.join(input.changesDir, entry.name);
      const raw = await fs.readFile(metadataPath, "utf8");
      const parsed = JSON.parse(raw) as Pick<ChangeRecord, "cwd" | "sessionId">;
      const remove =
        (typeof parsed.sessionId === "string" && removedSessionIds.has(parsed.sessionId)) ||
        (await isSameOrDescendant(String(parsed.cwd ?? ""), input.stateRootDir));
      if (!remove) {
        continue;
      }

      await fs.rm(metadataPath, { force: true });
      await fs.rm(path.join(input.changesDir, changeId), { recursive: true, force: true }).catch(() => null);
      removedIds.push(changeId);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return removedIds;
}

async function clearProjectDeadmouseDirectory(deadmouseDir: string): Promise<{
  removedEntries: string[];
  preservedEntries: string[];
}> {
  const removedEntries: string[] = [];
  const preservedEntries: string[] = [];

  try {
    const entries = await fs.readdir(deadmouseDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(deadmouseDir, entry.name);
      if (PRESERVED_DEADMOUSE_ENTRIES.has(entry.name)) {
        preservedEntries.push(entry.name);
        continue;
      }

      await fs.rm(absolutePath, { recursive: true, force: true });
      removedEntries.push(entry.name);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return {
    removedEntries,
    preservedEntries,
  };
}

