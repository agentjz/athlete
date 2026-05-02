import path from "node:path";
import { spawn } from "node:child_process";

import type { RuntimeConfig } from "../types.js";

export interface ExecutionWorkerLaunch {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export function buildExecutionWorkerLaunch(input: {
  rootDir: string;
  config: RuntimeConfig;
  executionId: string;
  actorName?: string;
}): ExecutionWorkerLaunch {
  const cliEntry = path.resolve(process.argv[1] ?? "");
  if (!cliEntry) {
    throw new Error("Unable to locate CLI entrypoint for execution worker.");
  }

  return {
    command: process.execPath,
    args: [
      cliEntry,
      "-C",
      input.rootDir,
      "__worker__",
      "run",
      "--execution-id",
      input.executionId,
    ],
    cwd: input.rootDir,
    env: buildExecutionWorkerEnv(input),
  };
}

export function spawnExecutionWorker(input: {
  rootDir: string;
  config: RuntimeConfig;
  executionId: string;
  actorName?: string;
}): number {
  if (process.env.KITTY_TEST_WORKER_MODE === "stub") {
    return process.pid;
  }

  const launch = buildExecutionWorkerLaunch(input);
  const child = spawn(
    launch.command,
    launch.args,
    {
      cwd: launch.cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: launch.env,
    },
  );

  child.unref();
  if (!child.pid) {
    throw new Error("Failed to spawn execution worker process.");
  }

  return child.pid;
}

function buildExecutionWorkerEnv(input: {
  rootDir: string;
  config: RuntimeConfig;
  actorName?: string;
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    KITTY_API_KEY: input.config.apiKey,
    KITTY_BASE_URL: input.config.baseUrl,
    KITTY_MODEL: input.config.model,
    KITTY_PROVIDER: input.config.provider,
    KITTY_THINKING: input.config.thinking,
  };
  if (input.config.reasoningEffort) {
    env.KITTY_REASONING_EFFORT = input.config.reasoningEffort;
  }
  deleteObsoleteIdentityModelEnv(env);

  return env;
}

function deleteObsoleteIdentityModelEnv(env: NodeJS.ProcessEnv): void {
  for (const identity of ["LEAD", "TEAMMATE", "SUBAGENT"]) {
    for (const field of ["API_KEY", "BASE_URL", "MODEL", "PROVIDER", "THINKING", "REASONING_EFFORT"]) {
      delete env[`KITTY_${identity}_${field}`];
    }
  }
}
