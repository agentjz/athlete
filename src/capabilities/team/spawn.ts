import path from "node:path";

import type { RuntimeConfig } from "../../types.js";

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
    DEADMOUSE_PROVIDER: options.config.provider,
    DEADMOUSE_THINKING: options.config.thinking,
  };
  if (options.config.reasoningEffort) {
    env.DEADMOUSE_REASONING_EFFORT = options.config.reasoningEffort;
  }
  deleteObsoleteIdentityModelEnv(env);

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

function deleteObsoleteIdentityModelEnv(env: NodeJS.ProcessEnv): void {
  for (const identity of ["LEAD", "TEAMMATE", "SUBAGENT"]) {
    for (const field of ["API_KEY", "BASE_URL", "MODEL", "PROVIDER", "THINKING", "REASONING_EFFORT"]) {
      delete env[`DEADMOUSE_${identity}_${field}`];
    }
  }
}
