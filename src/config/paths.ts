import path from "node:path";

import type { AppPaths } from "../types.js";

export function getAppPaths(rootDir = process.cwd()): AppPaths {
  const kittyDir = path.join(path.resolve(rootDir), ".kitty");

  return {
    configDir: kittyDir,
    dataDir: kittyDir,
    cacheDir: path.join(kittyDir, "cache"),
    configFile: path.join(kittyDir, "config.json"),
    sessionsDir: path.join(kittyDir, "sessions"),
    changesDir: path.join(kittyDir, "changes"),
  };
}
