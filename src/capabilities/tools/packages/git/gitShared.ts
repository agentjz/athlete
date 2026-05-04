import path from "node:path";
import fs from "node:fs/promises";

import { loadExeca } from "../../../../utils/execa.js";
import { resolveUserPath } from "../../../../utils/fs.js";
import type { ToolContext } from "../../core/types.js";

export interface GitFileStatus {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
  status: string;
  ignored: boolean;
  untracked: boolean;
  renamedFrom?: string;
}

export interface GitStatusSnapshot {
  root: string;
  branch: string;
  files: GitFileStatus[];
  summary: {
    modified: number;
    added: number;
    deleted: number;
    renamed: number;
    untracked: number;
    ignored: number;
    conflicted: number;
  };
}

export async function runGit(
  context: ToolContext,
  args: string[],
  options: {
    cwd?: string;
    reject?: boolean;
  } = {},
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const execa = await loadExeca();
  const cwd = options.cwd ? resolveUserPath(options.cwd, context.cwd) : context.cwd;
  const result = await execa("git", args, {
    cwd,
    reject: options.reject ?? false,
    timeout: 30_000,
    windowsHide: true,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? 0,
  };
}

export async function resolveGitRoot(context: ToolContext, cwd?: string): Promise<string> {
  const resolvedCwd = cwd ? await resolveGitProbeCwd(resolveUserPath(cwd, context.cwd)) : context.cwd;
  const result = await runGit(context, ["rev-parse", "--show-toplevel"], {
    cwd: resolvedCwd,
  });
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    throw new Error("git tool requires a Git worktree.");
  }

  return path.resolve(result.stdout.trim());
}

async function resolveGitProbeCwd(resolvedPath: string): Promise<string> {
  try {
    const stat = await fs.stat(resolvedPath);
    return stat.isDirectory() ? resolvedPath : path.dirname(resolvedPath);
  } catch {
    return path.extname(resolvedPath) ? path.dirname(resolvedPath) : resolvedPath;
  }
}

export async function readGitStatusSnapshot(
  context: ToolContext,
  input: {
    path?: string;
    includeIgnored?: boolean;
    includeUntracked?: boolean;
  } = {},
): Promise<GitStatusSnapshot> {
  const root = await resolveGitRoot(context, input.path);
  const branchResult = await runGit(context, ["branch", "--show-current"], { cwd: root });
  const statusArgs = ["status", "--porcelain=v1", "-z"];
  if (input.includeIgnored) {
    statusArgs.push("--ignored");
  }
  if (!input.includeUntracked) {
    statusArgs.push("--untracked-files=no");
  }
  const statusResult = await runGit(context, statusArgs, { cwd: root });
  const files = parsePorcelainStatus(statusResult.stdout);

  return {
    root,
    branch: branchResult.stdout.trim(),
    files,
    summary: summarizeStatus(files),
  };
}

export function parsePorcelainStatus(stdout: string): GitFileStatus[] {
  const tokens = stdout.split("\0").filter((item) => item.length > 0);
  const files: GitFileStatus[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    const indexStatus = token[0] ?? " ";
    const worktreeStatus = token[1] ?? " ";
    const filePath = token.slice(3);
    if (!filePath) {
      continue;
    }

    let renamedFrom: string | undefined;
    if (indexStatus === "R" || indexStatus === "C") {
      renamedFrom = tokens[index + 1];
      index += renamedFrom ? 1 : 0;
    }

    files.push({
      path: filePath.replace(/\\/g, "/"),
      indexStatus,
      worktreeStatus,
      status: `${indexStatus}${worktreeStatus}`,
      ignored: indexStatus === "!" && worktreeStatus === "!",
      untracked: indexStatus === "?" && worktreeStatus === "?",
      renamedFrom: renamedFrom?.replace(/\\/g, "/"),
    });
  }

  return files;
}

function summarizeStatus(files: GitFileStatus[]): GitStatusSnapshot["summary"] {
  const summary: GitStatusSnapshot["summary"] = {
    modified: 0,
    added: 0,
    deleted: 0,
    renamed: 0,
    untracked: 0,
    ignored: 0,
    conflicted: 0,
  };

  for (const file of files) {
    if (file.ignored) {
      summary.ignored += 1;
      continue;
    }
    if (file.untracked) {
      summary.untracked += 1;
      continue;
    }
    if (file.indexStatus === "U" || file.worktreeStatus === "U") {
      summary.conflicted += 1;
    }
    if (file.indexStatus === "A" || file.worktreeStatus === "A") {
      summary.added += 1;
    }
    if (file.indexStatus === "M" || file.worktreeStatus === "M") {
      summary.modified += 1;
    }
    if (file.indexStatus === "D" || file.worktreeStatus === "D") {
      summary.deleted += 1;
    }
    if (file.indexStatus === "R" || file.worktreeStatus === "R") {
      summary.renamed += 1;
    }
  }

  return summary;
}
