import path from "node:path";

import type { RuntimeConfig } from "../types.js";

export interface BuildTeammateWorkerEnvOptions {
  rootDir: string;
  config: RuntimeConfig;
  name: string;
  role: string;
  prompt: string;
}

export function buildTeammateWorkerEnv(options: BuildTeammateWorkerEnvOptions): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DEADMOUSE_API_KEY: options.config.apiKey,
    DEADMOUSE_BASE_URL: options.config.baseUrl,
    DEADMOUSE_MODEL: options.config.model,
    DEADMOUSE_MODE: options.config.mode,
  };
  if (options.config.reasoningEffort) {
    env.DEADMOUSE_REASONING_EFFORT = options.config.reasoningEffort;
  }

  const playwright = options.config.mcp.playwright;
  if (options.config.mcp.enabled && playwright.enabled && !playwright.isolated) {
    env.DEADMOUSE_MCP_PLAYWRIGHT_USER_DATA_DIR = path.join(
      options.rootDir,
      ".deadmouse",
      "playwright-mcp",
      "teammates",
      options.name,
      "profile",
    );
    delete env.DEADMOUSE_MCP_PLAYWRIGHT_ISOLATED;
  }

  return env;
}
