import fs from "node:fs/promises";
import path from "node:path";

import { runCommand } from "./process.ts";

const EXCLUDED_ROOTS = new Set([
  ".git",
  ".kitty",
  ".test-build",
  ".tmp-smoke",
  "dist",
  "node_modules",
  "ref",
]);

export interface LiveEcologyMirror {
  realRoot: string;
  runRoot: string;
  mirrorRoot: string;
}

export async function createLiveEcologyMirror(realRoot: string, runRoot: string): Promise<LiveEcologyMirror> {
  const mirrorRoot = path.join(runRoot, "mirror-world");
  await fs.rm(mirrorRoot, { recursive: true, force: true });
  await copyTree(realRoot, mirrorRoot, runRoot);
  return {
    realRoot,
    runRoot,
    mirrorRoot,
  };
}

export async function prepareLiveEcologyMirror(mirror: LiveEcologyMirror): Promise<void> {
  await runCommand("npm.cmd", ["install"], {
    cwd: mirror.mirrorRoot,
    timeoutMs: 10 * 60 * 1000,
    capturePath: path.join(mirror.runRoot, "mirror-npm-install.txt"),
  });
  await runCommand("npm.cmd", ["run", "test:build"], {
    cwd: mirror.mirrorRoot,
    timeoutMs: 2 * 60 * 1000,
    capturePath: path.join(mirror.runRoot, "mirror-test-build.txt"),
  });
  await runCommand("npm.cmd", ["run", "build"], {
    cwd: mirror.mirrorRoot,
    timeoutMs: 2 * 60 * 1000,
    capturePath: path.join(mirror.runRoot, "mirror-build.txt"),
  });
}

async function copyTree(source: string, target: string, runRoot: string): Promise<void> {
  const sourceRoot = path.resolve(source);
  const targetRoot = path.resolve(target);
  const runRootResolved = path.resolve(runRoot);
  await fs.mkdir(targetRoot, { recursive: true });
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (EXCLUDED_ROOTS.has(entry.name) || entry.name.startsWith("live-ecology-test-")) {
      continue;
    }

    const sourcePath = path.join(sourceRoot, entry.name);
    const targetPath = path.join(targetRoot, entry.name);
    const sourceResolved = path.resolve(sourcePath);
    if (sourceResolved === runRootResolved || sourceResolved.startsWith(`${runRootResolved}${path.sep}`)) {
      continue;
    }

    if (entry.isDirectory()) {
      await copyTree(sourcePath, targetPath, runRoot);
      continue;
    }
    if (entry.isFile()) {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}
