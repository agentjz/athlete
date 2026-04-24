import envPaths from "env-paths";
import path from "node:path";

import type { AppPaths } from "../types.js";

export function getAppPaths(): AppPaths {
  const resolved = envPaths("deadmouse", { suffix: "" });

  return {
    configDir: resolved.config,
    dataDir: resolved.data,
    cacheDir: resolved.cache,
    configFile: path.join(resolved.config, "config.json"),
    sessionsDir: path.join(resolved.data, "sessions"),
    changesDir: path.join(resolved.data, "changes"),
  };
}
