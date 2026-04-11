import fs from "node:fs/promises";
import path from "node:path";

import { ensureProjectStateDirectories, getProjectStatePaths } from "../../project/statePaths.js";
import type { ProjectStatePaths } from "../../project/statePaths.js";

export interface LegacyControlPlanePaths {
  tasksDir: string;
  teamConfigFile: string;
  coordinationPolicyFile: string;
  requestsDir: string;
  backgroundDir: string;
  worktreeIndexFile: string;
}

export function getLegacyControlPlanePaths(rootDir: string): LegacyControlPlanePaths {
  const paths = getProjectStatePaths(rootDir);
  return {
    tasksDir: path.join(paths.athleteDir, "tasks"),
    teamConfigFile: path.join(paths.teamDir, "config.json"),
    coordinationPolicyFile: path.join(paths.teamDir, "policy.json"),
    requestsDir: path.join(paths.teamDir, "requests"),
    backgroundDir: path.join(paths.teamDir, "background"),
    worktreeIndexFile: path.join(paths.worktreesDir, "index.json"),
  };
}

export async function prepareControlPlaneLayout(rootDir: string): Promise<ProjectStatePaths> {
  const paths = await ensureProjectStateDirectories(rootDir);
  await cleanupLegacyControlPlaneTruth(rootDir);
  return paths;
}

export async function cleanupLegacyControlPlaneTruth(rootDir: string): Promise<void> {
  const legacyPaths = getLegacyControlPlanePaths(rootDir);
  await Promise.all([
    fs.rm(legacyPaths.tasksDir, { recursive: true, force: true }),
    fs.rm(legacyPaths.requestsDir, { recursive: true, force: true }),
    fs.rm(legacyPaths.backgroundDir, { recursive: true, force: true }),
    fs.rm(legacyPaths.teamConfigFile, { force: true }),
    fs.rm(legacyPaths.coordinationPolicyFile, { force: true }),
    fs.rm(legacyPaths.worktreeIndexFile, { force: true }),
  ]);
}
