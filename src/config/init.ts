import fs from "node:fs/promises";
import path from "node:path";

import { buildProjectEnvTemplate } from "./projectEnvTemplate.js";
import { getDefaultDeadmouseIgnoreContent } from "../utils/ignore.js";

export interface InitProjectResult {
  created: string[];
  skipped: string[];
}

export async function initializeProjectFiles(cwd: string): Promise<InitProjectResult> {
  const created: string[] = [];
  const skipped: string[] = [];

  const deadmouseDir = path.join(cwd, ".deadmouse");
  const envPath = path.join(deadmouseDir, ".env");
  const envExamplePath = path.join(deadmouseDir, ".env.example");
  const ignorePath = path.join(deadmouseDir, ".deadmouseignore");
  const envTemplate = buildProjectEnvTemplate(false);
  const envExampleTemplate = buildProjectEnvTemplate(true);

  // Ensure .deadmouse directory exists
  await fs.mkdir(deadmouseDir, { recursive: true });

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
    await fs.writeFile(ignorePath, getDefaultDeadmouseIgnoreContent(), "utf8");
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
