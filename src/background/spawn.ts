import path from "node:path";
import { spawn } from "node:child_process";

export interface SpawnBackgroundProcessOptions {
  rootDir: string;
  jobId: string;
}

export function spawnBackgroundProcess(options: SpawnBackgroundProcessOptions): number {
  const cliEntry = path.resolve(process.argv[1] ?? "");
  if (!cliEntry) {
    throw new Error("Unable to locate CLI entrypoint for background worker.");
  }

  const child = spawn(
    process.execPath,
    [
      cliEntry,
      "-C",
      options.rootDir,
      "__worker__",
      "background",
      "--job-id",
      options.jobId,
    ],
    {
      cwd: options.rootDir,
      detached: true,
      stdio: "ignore",
      env: process.env,
    },
  );

  child.unref();
  if (!child.pid) {
    throw new Error("Failed to spawn background worker process.");
  }

  return child.pid;
}
