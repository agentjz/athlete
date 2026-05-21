import fs from "node:fs/promises";
import path from "node:path";

import type { ChangeRecord, RuntimeConfig, SessionRecord } from "../types.js";
import { resolveProjectRoots } from "../context/repoRoots.js";
import { getProjectStatePaths, PRESERVED_PROJECT_STATE_ENTRY_NAMES } from "./statePaths.js";
import { isSameOrDescendant, waitForRemovedPaths } from "./resetSupport.js";

const PRESERVED_PROJECT_STATE_ENTRIES = new Set<string>(PRESERVED_PROJECT_STATE_ENTRY_NAMES);

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
  removedStateEntries: string[];
  preservedStateEntries: string[];
}

export async function resetProjectRuntime(input: ResetProjectRuntimeInput): Promise<ResetProjectRuntimeResult> {
  const roots = await resolveProjectRoots(input.cwd);
  const statePaths = getProjectStatePaths(roots.stateRootDir);
  const kittyDir = statePaths.kittyDir;

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
  const { removedEntries, preservedEntries } = await clearProjectKittyDirectory(kittyDir);
  await waitForRemovedPaths(removedEntries.map((entry) => path.join(kittyDir, entry)));

  return {
    rootDir: roots.rootDir,
    stateRootDir: roots.stateRootDir,
    removedSessionIds,
    removedChangeIds,
    removedStateEntries: removedEntries,
    preservedStateEntries: preservedEntries,
  };
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

async function clearProjectKittyDirectory(kittyDir: string): Promise<{
  removedEntries: string[];
  preservedEntries: string[];
}> {
  const removedEntries: string[] = [];
  const preservedEntries: string[] = [];

  try {
    const entries = await fs.readdir(kittyDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(kittyDir, entry.name);
      if (PRESERVED_PROJECT_STATE_ENTRIES.has(entry.name)) {
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
