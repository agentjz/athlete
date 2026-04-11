import fs from "node:fs/promises";
import path from "node:path";

import type { ChangeRecord, RuntimeConfig, SessionRecord } from "../types.js";
import { resolveProjectRoots } from "../context/repoRoots.js";
import { terminateKnownProcesses } from "../utils/processControl.js";
import { getProjectStatePaths } from "./statePaths.js";
import { WorktreeStore } from "../worktrees/store.js";

const PRESERVED_ATHLETE_ENTRIES = new Set([".env", ".env.example"]);

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
  const athleteDir = statePaths.athleteDir;

  const [worktrees, teamMembers, backgroundJobs] = await Promise.all([
    readTrackedWorktrees(roots.stateRootDir),
    readTeamMembers(statePaths.teamConfigFile),
    readBackgroundJobs(statePaths.backgroundDir),
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
  await waitForRemovedSessionFiles(input.config.paths.sessionsDir, removedSessionIds);
  const removedChangeIds = await removeProjectChanges({
    changesDir: input.config.paths.changesDir,
    stateRootDir: roots.stateRootDir,
    removedSessionIds,
  });
  const { removedEntries, preservedEntries } = await clearProjectAthleteDirectory(athleteDir);
  await waitForRemovedStateEntries(athleteDir, removedEntries);

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
  const indexPath = getProjectStatePaths(rootDir).worktreeIndexFile;
  try {
    const raw = await fs.readFile(indexPath, "utf8");
    const parsed = JSON.parse(raw) as { items?: Array<{ name?: unknown; path?: unknown; status?: unknown }> };
    return Array.isArray(parsed.items)
      ? parsed.items
          .map((item) => ({
            name: String(item?.name ?? "").trim(),
            path: String(item?.path ?? "").trim(),
            status: typeof item?.status === "string" ? item.status : undefined,
          }))
          .filter((item) => item.name && item.path)
      : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function readTeamMembers(teamConfigFile: string): Promise<Array<{ pid?: number }>> {
  try {
    const raw = await fs.readFile(teamConfigFile, "utf8");
    const parsed = JSON.parse(raw) as { members?: Array<{ pid?: unknown }> };
    return Array.isArray(parsed.members)
      ? parsed.members.map((member) => ({
          pid: typeof member?.pid === "number" && Number.isFinite(member.pid) ? Math.trunc(member.pid) : undefined,
        }))
      : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function readBackgroundJobs(backgroundDir: string): Promise<Array<{ pid?: number }>> {
  try {
    const entries = await fs.readdir(backgroundDir, { withFileTypes: true });
    const records = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && /^job_[a-z0-9]+\.json$/i.test(entry.name))
        .map(async (entry) => {
          const raw = await fs.readFile(path.join(backgroundDir, entry.name), "utf8");
          const parsed = JSON.parse(raw) as { pid?: unknown };
          return {
            pid: typeof parsed.pid === "number" && Number.isFinite(parsed.pid) ? Math.trunc(parsed.pid) : undefined,
          };
        }),
    );
    return records;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
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
  const stateRootDir = await canonicalizePathForComparison(input.stateRootDir);

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
        removeByPath = await isSameOrDescendant(String(parsed.cwd ?? ""), stateRootDir);
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
  const stateRootDir = await canonicalizePathForComparison(input.stateRootDir);
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
        (await isSameOrDescendant(String(parsed.cwd ?? ""), stateRootDir));
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

async function clearProjectAthleteDirectory(athleteDir: string): Promise<{
  removedEntries: string[];
  preservedEntries: string[];
}> {
  const removedEntries: string[] = [];
  const preservedEntries: string[] = [];

  try {
    const entries = await fs.readdir(athleteDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(athleteDir, entry.name);
      if (PRESERVED_ATHLETE_ENTRIES.has(entry.name)) {
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

async function waitForRemovedStateEntries(
  athleteDir: string,
  removedEntries: string[],
  attempts = 20,
  delayMs = 50,
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const remaining = await Promise.all(
      removedEntries.map(async (entry) => ({
        entry,
        exists: await pathExists(path.join(athleteDir, entry)),
      })),
    );

    if (remaining.every((item) => item.exists === false)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function waitForRemovedSessionFiles(
  sessionsDir: string,
  removedSessionIds: string[],
  attempts = 20,
  delayMs = 50,
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const remaining = await Promise.all(
      removedSessionIds.map(async (sessionId) => ({
        sessionId,
        exists: await pathExists(path.join(sessionsDir, `${sessionId}.json`)),
      })),
    );

    if (remaining.every((item) => item.exists === false)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function isSameOrDescendant(targetPath: string, possibleAncestor: string): Promise<boolean> {
  if (!targetPath.trim() || !possibleAncestor.trim()) {
    return false;
  }

  const resolvedTarget = await canonicalizePathForComparison(targetPath);
  const resolvedAncestor = await canonicalizePathForComparison(possibleAncestor);
  const relative = path.relative(resolvedAncestor, resolvedTarget);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function canonicalizePathForComparison(targetPath: string): Promise<string> {
  let candidate = path.resolve(targetPath);
  const tail: string[] = [];

  while (true) {
    try {
      const real = await fs.realpath(candidate);
      return tail.length > 0 ? path.join(real, ...tail.reverse()) : real;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        return tail.length > 0 ? path.join(candidate, ...tail.reverse()) : candidate;
      }
    }

    const parent = path.dirname(candidate);
    if (parent === candidate) {
      return tail.length > 0 ? path.join(candidate, ...tail.reverse()) : candidate;
    }

    tail.push(path.basename(candidate));
    candidate = parent;
  }
}
