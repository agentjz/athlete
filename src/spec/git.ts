import { execa } from "execa";

export async function runSpecGit(
  cwd: string,
  args: string[],
): Promise<{
  stdout: string;
  stderr: string;
}> {
  const result = await execa("git", args, {
    cwd,
    all: true,
    reject: false,
  });
  if (result.exitCode !== 0) {
    throw new Error(result.all || result.stderr || `git ${args.join(" ")} failed.`);
  }
  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export async function readGitHead(cwd: string): Promise<string> {
  return (await runSpecGit(cwd, ["rev-parse", "HEAD"])).stdout.trim();
}

export async function readGitStatus(cwd: string): Promise<string> {
  return (await runSpecGit(cwd, ["status", "--short"])).stdout.trim();
}

export async function gitRefExists(cwd: string, ref: string): Promise<boolean> {
  try {
    await runSpecGit(cwd, ["show-ref", "--verify", "--quiet", ref]);
    return true;
  } catch {
    return false;
  }
}
