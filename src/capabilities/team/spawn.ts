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
    DEADMOUSE_LEAD_API_KEY: options.config.agentModels.lead.apiKey,
    DEADMOUSE_LEAD_BASE_URL: options.config.agentModels.lead.baseUrl,
    DEADMOUSE_LEAD_MODEL: options.config.agentModels.lead.model,
    DEADMOUSE_LEAD_PROVIDER: options.config.agentModels.lead.provider,
    DEADMOUSE_LEAD_THINKING: options.config.agentModels.lead.thinking,
    DEADMOUSE_TEAMMATE_API_KEY: options.config.agentModels.teammate.apiKey,
    DEADMOUSE_TEAMMATE_BASE_URL: options.config.agentModels.teammate.baseUrl,
    DEADMOUSE_TEAMMATE_MODEL: options.config.agentModels.teammate.model,
    DEADMOUSE_TEAMMATE_PROVIDER: options.config.agentModels.teammate.provider,
    DEADMOUSE_TEAMMATE_THINKING: options.config.agentModels.teammate.thinking,
    DEADMOUSE_SUBAGENT_API_KEY: options.config.agentModels.subagent.apiKey,
    DEADMOUSE_SUBAGENT_BASE_URL: options.config.agentModels.subagent.baseUrl,
    DEADMOUSE_SUBAGENT_MODEL: options.config.agentModels.subagent.model,
    DEADMOUSE_SUBAGENT_PROVIDER: options.config.agentModels.subagent.provider,
    DEADMOUSE_SUBAGENT_THINKING: options.config.agentModels.subagent.thinking,
  };
  if (options.config.reasoningEffort) {
    env.DEADMOUSE_REASONING_EFFORT = options.config.reasoningEffort;
  }
  if (options.config.agentModels.lead.reasoningEffort) {
    env.DEADMOUSE_LEAD_REASONING_EFFORT = options.config.agentModels.lead.reasoningEffort;
  }
  if (options.config.agentModels.teammate.reasoningEffort) {
    env.DEADMOUSE_TEAMMATE_REASONING_EFFORT = options.config.agentModels.teammate.reasoningEffort;
  }
  if (options.config.agentModels.subagent.reasoningEffort) {
    env.DEADMOUSE_SUBAGENT_REASONING_EFFORT = options.config.agentModels.subagent.reasoningEffort;
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
