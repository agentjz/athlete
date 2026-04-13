import fs from "node:fs/promises";
import path from "node:path";

import { execa } from "execa";

export interface ProjectRoots {
  rootDir: string;
  stateRootDir: string;
}

export async function resolveProjectRoots(startDir: string): Promise<ProjectRoots> {
  const rootDir = await findExecutionRoot(startDir);
  const stateRootDir = await findStateRoot(rootDir);

  return {
    rootDir,
    stateRootDir,
  };
}

async function findExecutionRoot(startDir: string): Promise<string> {
  let currentDir = path.resolve(startDir);
  const fsRoot = path.parse(currentDir).root;

  while (true) {
    try {
      await fs.access(path.join(currentDir, ".git"));
      return currentDir;
    } catch {
      if (currentDir === fsRoot) {
        return path.resolve(startDir);
      }

      currentDir = path.dirname(currentDir);
    }
  }
}

async function findStateRoot(executionRoot: string): Promise<string> {
  try {
    const result = await execa(
      "git",
      ["-C", executionRoot, "rev-parse", "--path-format=absolute", "--git-common-dir"],
      {
        reject: true,
        timeout: 10_000,
        windowsHide: true,
      },
    );

    const commonGitDir = result.stdout.trim();
    if (!commonGitDir) {
      return executionRoot;
    }

    const normalizedCommonDir = path.resolve(commonGitDir);
    if (path.basename(normalizedCommonDir).toLowerCase() === ".git") {
      return path.dirname(normalizedCommonDir);
    }

    return executionRoot;
  } catch {
    return executionRoot;
  }
}
