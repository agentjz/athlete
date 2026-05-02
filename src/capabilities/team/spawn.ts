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
    KITTY_API_KEY: options.config.apiKey,
    KITTY_BASE_URL: options.config.baseUrl,
    KITTY_MODEL: options.config.model,
    KITTY_PROVIDER: options.config.provider,
    KITTY_THINKING: options.config.thinking,
  };
  if (options.config.reasoningEffort) {
    env.KITTY_REASONING_EFFORT = options.config.reasoningEffort;
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
