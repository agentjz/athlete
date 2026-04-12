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
