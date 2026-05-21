import fs from "node:fs/promises";
import path from "node:path";

export const PROJECT_STATE_DIR_NAME = ".kitty";
export const PROJECT_STATE_ENV_FILE_NAME = ".env";
export const PROJECT_STATE_ENV_EXAMPLE_FILE_NAME = ".env.example";
export const PROJECT_STATE_IGNORE_FILE_NAME = ".kittyignore";
export const PRESERVED_PROJECT_STATE_ENTRY_NAMES = [
  PROJECT_STATE_ENV_FILE_NAME,
  PROJECT_STATE_ENV_EXAMPLE_FILE_NAME,
] as const;

export interface ProjectStatePaths {
  rootDir: string;
  kittyDir: string;
  extensionsDir: string;
  observabilityDir: string;
  observabilityEventsDir: string;
  observabilityCrashesDir: string;
}

export function getProjectStatePaths(rootDir: string): ProjectStatePaths {
  const normalizedRoot = path.resolve(rootDir);
  const kittyDir = path.join(normalizedRoot, PROJECT_STATE_DIR_NAME);
  const extensionsDir = path.join(kittyDir, "extensions");
  const observabilityDir = path.join(kittyDir, "observability");
  return {
    rootDir: normalizedRoot,
    kittyDir,
    extensionsDir,
    observabilityDir,
    observabilityEventsDir: path.join(observabilityDir, "events"),
    observabilityCrashesDir: path.join(observabilityDir, "crashes"),
  };
}

export async function ensureProjectStateDirectories(rootDir: string): Promise<ProjectStatePaths> {
  const paths = getProjectStatePaths(rootDir);
  await fs.mkdir(paths.extensionsDir, { recursive: true });
  await fs.mkdir(paths.observabilityEventsDir, { recursive: true });
  await fs.mkdir(paths.observabilityCrashesDir, { recursive: true });
  return paths;
}
