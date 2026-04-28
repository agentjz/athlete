import fs from "node:fs/promises";
import path from "node:path";

import { ensureProjectStateDirectories, getProjectStatePaths } from "../../project/statePaths.js";
import type { ProjectStatePaths } from "../../project/statePaths.js";

export interface RetiredControlPlanePaths {
  tasksDir: string;
  teamConfigFile: string;
  coordinationPolicyFile: string;
  requestsDir: string;
  backgroundDir: string;
  worktreeIndexFile: string;
}

export function getRetiredControlPlanePaths(rootDir: string): RetiredControlPlanePaths {
  const paths = getProjectStatePaths(rootDir);
  return {
    tasksDir: path.join(paths.deadmouseDir, "tasks"),
    teamConfigFile: path.join(paths.teamDir, "config.json"),
    coordinationPolicyFile: path.join(paths.teamDir, "policy.json"),
    requestsDir: path.join(paths.teamDir, "requests"),
    backgroundDir: path.join(paths.teamDir, "background"),
    worktreeIndexFile: path.join(paths.worktreesDir, "index.json"),
  };
}

export async function prepareControlPlaneLayout(rootDir: string): Promise<ProjectStatePaths> {
  const paths = await ensureProjectStateDirectories(rootDir);
  await cleanupRetiredControlPlaneFiles(rootDir);
  return paths;
}

export async function cleanupRetiredControlPlaneFiles(rootDir: string): Promise<void> {
  const retiredPaths = getRetiredControlPlanePaths(rootDir);
  for (const targetPath of [
    retiredPaths.tasksDir,
    retiredPaths.requestsDir,
    retiredPaths.backgroundDir,
    retiredPaths.teamConfigFile,
    retiredPaths.coordinationPolicyFile,
    retiredPaths.worktreeIndexFile,
  ]) {
    await removeRetiredPath(targetPath);
  }
}

async function removeRetiredPath(targetPath: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await fs.rm(targetPath, { recursive: true, force: true, maxRetries: 2, retryDelay: 80 });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }

  throw lastError;
}
