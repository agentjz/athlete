import fs from "node:fs/promises";
import path from "node:path";

export interface ProjectStatePaths {
  rootDir: string;
  athleteDir: string;
  teamDir: string;
  backgroundDir: string;
  inboxDir: string;
  messageLogFile: string;
  coordinationPolicyFile: string;
  teamConfigFile: string;
  requestsDir: string;
  tasksDir: string;
  toolResultsDir: string;
  worktreesDir: string;
  worktreeIndexFile: string;
  worktreeEventsFile: string;
}

export function getProjectStatePaths(rootDir: string): ProjectStatePaths {
  const normalizedRoot = path.resolve(rootDir);
  const athleteDir = path.join(normalizedRoot, ".athlete");
  const teamDir = path.join(athleteDir, "team");
  const worktreesDir = path.join(athleteDir, "worktrees");
  return {
    rootDir: normalizedRoot,
    athleteDir,
    teamDir,
    backgroundDir: path.join(teamDir, "background"),
    inboxDir: path.join(teamDir, "inbox"),
    messageLogFile: path.join(teamDir, "messages.jsonl"),
    coordinationPolicyFile: path.join(teamDir, "policy.json"),
    teamConfigFile: path.join(teamDir, "config.json"),
    requestsDir: path.join(teamDir, "requests"),
    tasksDir: path.join(athleteDir, "tasks"),
    toolResultsDir: path.join(athleteDir, "tool-results"),
    worktreesDir,
    worktreeIndexFile: path.join(worktreesDir, "index.json"),
    worktreeEventsFile: path.join(worktreesDir, "events.jsonl"),
  };
}

export async function ensureProjectStateDirectories(rootDir: string): Promise<ProjectStatePaths> {
  const paths = getProjectStatePaths(rootDir);
  await fs.mkdir(paths.teamDir, { recursive: true });
  await fs.mkdir(paths.backgroundDir, { recursive: true });
  await fs.mkdir(paths.inboxDir, { recursive: true });
  await fs.mkdir(paths.requestsDir, { recursive: true });
  await fs.mkdir(paths.tasksDir, { recursive: true });
  await fs.mkdir(paths.toolResultsDir, { recursive: true });
  await fs.mkdir(paths.worktreesDir, { recursive: true });
  return paths;
}
