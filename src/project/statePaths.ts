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
  observabilityDir: string;
  observabilityEventsDir: string;
  observabilityCrashesDir: string;
}

export function getProjectStatePaths(rootDir: string): ProjectStatePaths {
  const normalizedRoot = path.resolve(rootDir);
  const athleteDir = path.join(normalizedRoot, ".athlete");
  const teamDir = path.join(athleteDir, "team");
  const worktreesDir = path.join(athleteDir, "worktrees");
  const observabilityDir = path.join(athleteDir, "observability");
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
    observabilityDir,
    observabilityEventsDir: path.join(observabilityDir, "events"),
    observabilityCrashesDir: path.join(observabilityDir, "crashes"),
  };
}

export async function ensureProjectStateDirectories(rootDir: string): Promise<ProjectStatePaths> {
  const paths = getProjectStatePaths(rootDir);
  await fs.mkdir(paths.teamDir, { recursive: true });
  await fs.mkdir(paths.inboxDir, { recursive: true });
  await fs.mkdir(paths.toolResultsDir, { recursive: true });
  await fs.mkdir(paths.worktreesDir, { recursive: true });
  await fs.mkdir(paths.observabilityEventsDir, { recursive: true });
  await fs.mkdir(paths.observabilityCrashesDir, { recursive: true });
  return paths;
}
