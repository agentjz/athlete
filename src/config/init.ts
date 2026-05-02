import fs from "node:fs/promises";
import path from "node:path";

import { buildProjectEnvTemplate } from "./projectEnvTemplate.js";
import { getDefaultKittyIgnoreContent } from "../utils/ignore.js";

export interface InitProjectResult {
  created: string[];
  skipped: string[];
}

export async function initializeProjectFiles(cwd: string): Promise<InitProjectResult> {
  const created: string[] = [];
  const skipped: string[] = [];

  const kittyDir = path.join(cwd, ".kitty");
  const envPath = path.join(kittyDir, ".env");
  const envExamplePath = path.join(kittyDir, ".env.example");
  const ignorePath = path.join(kittyDir, ".kittyignore");
  const envTemplate = buildProjectEnvTemplate(false);
  const envExampleTemplate = buildProjectEnvTemplate(true);

  // Ensure .kitty directory exists
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
