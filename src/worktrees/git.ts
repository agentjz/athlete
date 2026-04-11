import { execa } from "execa";

export async function ensureGitRepository(rootDir: string): Promise<void> {
  try {
    await runGitCommand(rootDir, ["rev-parse", "--show-toplevel"]);
  } catch {
    throw new Error("Worktree support requires a git repository.");
  }
}

export async function branchExists(rootDir: string, branch: string): Promise<boolean> {
  try {
    await runGitCommand(rootDir, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

export async function runGitCommand(rootDir: string, args: string[]): Promise<void> {
  await execa("git", ["-C", rootDir, ...args], {
    reject: true,
    timeout: 120_000,
    all: true,
    windowsHide: true,
  });
}
