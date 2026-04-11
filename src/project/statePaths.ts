import fs from "node:fs/promises";
import path from "node:path";

export interface ProjectStatePaths {
  rootDir: string;
  athleteDir: string;
  controlPlaneDbFile: string;
  teamDir: string;
  inboxDir: string;
  messageLogFile: string;
  toolResultsDir: string;
  worktreesDir: string;
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
    controlPlaneDbFile: path.join(athleteDir, "control-plane.sqlite"),
    teamDir,
    inboxDir: path.join(teamDir, "inbox"),
    messageLogFile: path.join(teamDir, "messages.jsonl"),
    toolResultsDir: path.join(athleteDir, "tool-results"),
    worktreesDir,
    worktreeEventsFile: path.join(worktreesDir, "events.jsonl"),
  };
}

export async function ensureProjectStateDirectories(rootDir: string): Promise<ProjectStatePaths> {
  const paths = getProjectStatePaths(rootDir);
  await fs.mkdir(paths.teamDir, { recursive: true });
  await fs.mkdir(paths.inboxDir, { recursive: true });
  await fs.mkdir(paths.toolResultsDir, { recursive: true });
  await fs.mkdir(paths.worktreesDir, { recursive: true });
  return paths;
}
