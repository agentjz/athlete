import path from "node:path";

import type { AppPaths } from "../types.js";
import { PROJECT_STATE_DIR_NAME } from "../project/statePaths.js";

export function getAppPaths(rootDir = process.cwd()): AppPaths {
  const kittyDir = path.join(path.resolve(rootDir), PROJECT_STATE_DIR_NAME);

  return {
    configDir: kittyDir,
    dataDir: kittyDir,
    cacheDir: path.join(kittyDir, "cache"),
    sessionsDir: path.join(kittyDir, "sessions"),
    changesDir: path.join(kittyDir, "changes"),
  };
}
