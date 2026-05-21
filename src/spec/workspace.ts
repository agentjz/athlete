import fs from "node:fs/promises";
import path from "node:path";

import {
  getSpecPaths,
  getSpecWorkspacesDir,
  sanitizeSpecIdPart,
} from "./layout.js";
import {
  gitRefExists,
  readGitHead,
  readGitStatus,
  runSpecGit,
} from "./git.js";
import type {
  SpecWorkspaceCheckpoint,
  SpecWorkspaceRef,
} from "./types.js";

export async function ensureSpecWorkspace(input: {
  rootDir: string;
  stateRootDir: string;
  specId: string;
}): Promise<SpecWorkspaceRef> {
  await assertGitRepository(input.rootDir);
  const paths = getSpecPaths(input.stateRootDir, input.specId);
  await fs.mkdir(paths.workspacesDir, { recursive: true });

  const name = sanitizeSpecWorkspaceName(input.specId);
  const workspacePath = path.join(paths.workspacesDir, name);
  const branch = `spec/${name}`;
  const existing = await pathExists(workspacePath);
  if (existing) {
    return {
      name,
      path: workspacePath,
      branch,
    };
  }

  const branchRef = `refs/heads/${branch}`;
  const args = await gitRefExists(input.rootDir, branchRef)
    ? ["worktree", "add", workspacePath, branch]
    : ["worktree", "add", "-b", branch, workspacePath, "HEAD"];
  await runSpecGit(input.rootDir, args);
  return {
    name,
    path: workspacePath,
    branch,
  };
}

export async function createSpecWorkspaceCheckpoint(input: {
  workspace: SpecWorkspaceRef;
  specId: string;
  checkpointId: string;
  label: string;
}): Promise<SpecWorkspaceCheckpoint> {
  await assertGitRepository(input.workspace.path);
  const dirtyBeforeCommit = (await readGitStatus(input.workspace.path)).length > 0;
  if (dirtyBeforeCommit) {
    await runSpecGit(input.workspace.path, ["add", "--all"]);
    await runSpecGit(input.workspace.path, [
      "commit",
      "-m",
      `spec checkpoint: ${input.specId} ${input.checkpointId} ${input.label}`.slice(0, 180),
    ]);
  }
  const commit = await readGitHead(input.workspace.path);
  const tag = buildCheckpointRef(input.specId, input.checkpointId);
  await runSpecGit(input.workspace.path, ["tag", "-f", tag, commit]);
  return {
    path: input.workspace.path,
    branch: input.workspace.branch,
    commit,
    dirtyBeforeCommit,
  };
}

export async function restoreSpecWorkspaceCheckpoint(input: {
  rootDir: string;
  stateRootDir: string;
  workspace: SpecWorkspaceRef;
  checkpoint: SpecWorkspaceCheckpoint;
}): Promise<void> {
  await assertSpecWorkspaceCheckpointRestorable(input);
  await runSpecGit(input.workspace.path, ["reset", "--hard", input.checkpoint.commit]);
  await runSpecGit(input.workspace.path, ["clean", "-fd"]);
}

export async function assertSpecWorkspaceCheckpointRestorable(input: {
  rootDir: string;
  stateRootDir: string;
  workspace: SpecWorkspaceRef;
}): Promise<void> {
  assertSpecWorkspaceBoundary({
    rootDir: input.rootDir,
    stateRootDir: input.stateRootDir,
    workspacePath: input.workspace.path,
  });
  await assertGitRepository(input.workspace.path);
  const status = await readGitStatus(input.workspace.path);
  if (status) {
    throw new Error(
      `Spec workspace has uncheckpointed changes. Create a checkpoint before restoring: ${input.workspace.path}`,
    );
  }
}

export function assertSpecWorkspaceBoundary(input: {
  rootDir: string;
  stateRootDir: string;
  workspacePath: string;
}): void {
  const rootDir = path.resolve(input.rootDir);
  const workspacePath = path.resolve(input.workspacePath);
  const workspacesDir = path.resolve(getSpecWorkspacesDir(input.stateRootDir));

  if (workspacePath === rootDir) {
    throw new Error("Spec checkpoint restore refused to target the main repository worktree.");
  }

  const relative = path.relative(workspacesDir, workspacePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Spec checkpoint restore refused non-spec workspace path: ${workspacePath}`);
  }
}

function buildCheckpointRef(specId: string, checkpointId: string): string {
  return `spec-checkpoint-${sanitizeSpecIdPart(specId)}-${sanitizeSpecIdPart(checkpointId)}`.slice(0, 180);
}

function sanitizeSpecWorkspaceName(specId: string): string {
  return sanitizeSpecIdPart(specId).slice(0, 72) || "spec";
}

async function assertGitRepository(cwd: string): Promise<void> {
  try {
    await runSpecGit(cwd, ["rev-parse", "--show-toplevel"]);
  } catch {
    throw new Error("Spec worktree checkpoints require a git repository.");
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
