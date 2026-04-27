import path from "node:path";

import { resolveRuntimeConfig } from "../config/store.js";
import { resolveProjectRoots } from "../context/repoRoots.js";
import { installCrashRecorder } from "../observability/crashRecorder.js";
import type { CliOverrides, RuntimeConfig } from "../types.js";

export async function resolveCliRuntime(overrides: CliOverrides): Promise<{
  cwd: string;
  config: RuntimeConfig;
  paths: RuntimeConfig["paths"];
  overrides: CliOverrides;
}> {
  const cwd = overrides.cwd ? path.resolve(overrides.cwd) : process.cwd();
  const projectRoots = await resolveProjectRoots(cwd).catch(() => ({
    rootDir: cwd,
    stateRootDir: cwd,
  }));
  const config = await resolveRuntimeConfig({
    cwd,
    model: overrides.model,
    agentLane: overrides.agentLane,
  });
  installCrashRecorder({
    rootDir: projectRoots.stateRootDir,
    host: "cli",
  });

  return {
    cwd,
    config,
    paths: config.paths,
    overrides,
  };
}
