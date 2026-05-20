import { execa } from "execa";

export interface GitResult {
  exitCode: number;
  output: string;
}

export interface GitWorktreeRecord {
  path: string;
  branch?: string;
  head?: string;
}

export async function runGit(cwd: string, args: string[]): Promise<GitResult> {
  const result = await execa("git", args, {
    cwd,
    all: true,
    reject: false,
    timeout: 60_000,
    windowsHide: true,
  });
  return {
    exitCode: result.exitCode ?? 0,
    output: result.all ?? "",
  };
}

export function parseWorktreeList(output: string): GitWorktreeRecord[] {
  return output
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(parseWorktreeBlock)
    .filter((record) => record.path.length > 0);
}

function parseWorktreeBlock(block: string): GitWorktreeRecord {
  const record: GitWorktreeRecord = { path: "" };
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      record.path = line.slice("worktree ".length);
    } else if (line.startsWith("branch ")) {
      record.branch = line.slice("branch ".length);
    } else if (line.startsWith("HEAD ")) {
      record.head = line.slice("HEAD ".length);
    }
  }
  return record;
}
