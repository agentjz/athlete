import path from "node:path";
import { spawn } from "node:child_process";

import type { RuntimeConfig } from "../types.js";

export interface SpawnTeammateProcessOptions {
  rootDir: string;
  config: RuntimeConfig;
  name: string;
  role: string;
  prompt: string;
}

export function spawnTeammateProcess(options: SpawnTeammateProcessOptions): number {
  const cliEntry = path.resolve(process.argv[1] ?? "");
  if (!cliEntry) {
    throw new Error("Unable to locate CLI entrypoint for teammate worker.");
  }

  const child = spawn(
    process.execPath,
    [
      cliEntry,
      "-C",
      options.rootDir,
      "--mode",
      options.config.mode,
      "--model",
      options.config.model,
      "__worker__",
      "teammate",
      "--name",
      options.name,
      "--role",
      options.role,
      "--prompt",
      options.prompt,
    ],
    {
      cwd: options.rootDir,
      detached: true,
      stdio: "ignore",
      env: buildTeammateWorkerEnv(options),
    },
  );

  child.unref();
  if (!child.pid) {
    throw new Error("Failed to spawn teammate worker process.");
  }

  return child.pid;
}

export function buildTeammateWorkerEnv(options: SpawnTeammateProcessOptions): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ATHLETE_API_KEY: options.config.apiKey,
    ATHLETE_BASE_URL: options.config.baseUrl,
    ATHLETE_MODEL: options.config.model,
    ATHLETE_MODE: options.config.mode,
  };

  const playwright = options.config.mcp.playwright;
  if (options.config.mcp.enabled && playwright.enabled && !playwright.isolated) {
    env.ATHLETE_MCP_PLAYWRIGHT_USER_DATA_DIR = path.join(
      options.rootDir,
      ".athlete",
      "playwright-mcp",
      "teammates",
      options.name,
      "profile",
    );
    delete env.ATHLETE_MCP_PLAYWRIGHT_ISOLATED;
  }

  return env;
}
