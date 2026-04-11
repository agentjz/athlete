import path from "node:path";

import { resolveRuntimeConfig } from "../config/store.js";
import { parseAgentMode } from "../config/schema.js";
import type { AgentMode, CliOverrides, RuntimeConfig } from "../types.js";

export async function resolveCliRuntime(overrides: CliOverrides): Promise<{
  cwd: string;
  config: RuntimeConfig;
  paths: RuntimeConfig["paths"];
  overrides: CliOverrides;
}> {
  const cwd = overrides.cwd ? path.resolve(overrides.cwd) : process.cwd();
  const config = await resolveRuntimeConfig({
    cwd,
    model: overrides.model,
    mode: normalizeModeOverride(overrides.mode),
  });

  return {
    cwd,
    config,
    paths: config.paths,
    overrides,
  };
}

function normalizeModeOverride(value: string | AgentMode | undefined): AgentMode | undefined {
  return typeof value === "string" ? parseAgentMode(value) : value;
}
