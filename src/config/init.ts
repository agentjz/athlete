import fs from "node:fs/promises";
import path from "node:path";

import { buildProjectEnvTemplate } from "./projectEnvTemplate.js";
import { getDefaultKittyIgnoreContent } from "../utils/ignore.js";
import {
  PROJECT_STATE_DIR_NAME,
  PROJECT_STATE_ENV_EXAMPLE_FILE_NAME,
  PROJECT_STATE_ENV_FILE_NAME,
  PROJECT_STATE_IGNORE_FILE_NAME,
} from "../project/statePaths.js";

export interface InitProjectResult {
  created: string[];
  skipped: string[];
}

export async function initializeProjectFiles(cwd: string): Promise<InitProjectResult> {
  const created: string[] = [];
  const skipped: string[] = [];

  const kittyDir = path.join(cwd, PROJECT_STATE_DIR_NAME);
  const envPath = path.join(kittyDir, PROJECT_STATE_ENV_FILE_NAME);
  const envExamplePath = path.join(kittyDir, PROJECT_STATE_ENV_EXAMPLE_FILE_NAME);
  const ignorePath = path.join(kittyDir, PROJECT_STATE_IGNORE_FILE_NAME);
  const envTemplate = buildProjectEnvTemplate(false);
  const envExampleTemplate = buildProjectEnvTemplate(true);

  await fs.mkdir(kittyDir, { recursive: true });

  if (await fileExists(envPath)) {
    skipped.push(envPath);
  } else {
    await fs.writeFile(envPath, envTemplate, "utf8");
    created.push(envPath);
  }

  if (await fileExists(envExamplePath)) {
    skipped.push(envExamplePath);
  } else {
    await fs.writeFile(envExamplePath, envExampleTemplate, "utf8");
    created.push(envExamplePath);
  }

  if (await fileExists(ignorePath)) {
    skipped.push(ignorePath);
  } else {
    await fs.writeFile(ignorePath, getDefaultKittyIgnoreContent(), "utf8");
    created.push(ignorePath);
  }

  return {
    created,
    skipped,
  };
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
