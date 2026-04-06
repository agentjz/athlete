import path from "node:path";

import type { McpRuntimeConfigContext, PlaywrightMcpConfig } from "../types.js";

const PLAYWRIGHT_STATE_DIR = path.join(".athlete", "playwright-mcp");

export function resolvePlaywrightStateDir(runtime: McpRuntimeConfigContext): string {
  const stateRootDir = runtime.stateRootDir
    ? path.resolve(runtime.stateRootDir)
    : runtime.cwd
      ? path.resolve(runtime.cwd)
      : "";

  return stateRootDir ? path.join(stateRootDir, PLAYWRIGHT_STATE_DIR) : "";
}

export function resolvePlaywrightUserDataDir(
  explicitPath: string,
  cwd: string | undefined,
  isolated: boolean,
  stateDir: string,
): string {
  if (isolated) {
    return explicitPath ? resolveOptionalPath(explicitPath, cwd) : "";
  }

  if (explicitPath) {
    return resolveOptionalPath(explicitPath, cwd);
  }

  return stateDir ? path.join(stateDir, "profile") : "";
}

export function resolvePlaywrightStorageState(
  explicitPath: string,
  cwd: string | undefined,
  isolated: boolean,
  stateDir: string,
): string {
  if (explicitPath) {
    return resolveOptionalPath(explicitPath, cwd);
  }

  if (!isolated || !stateDir) {
    return "";
  }

  return path.join(stateDir, "storage-state.json");
}

export function resolveDefaultStatePath(explicitPath: string, cwd: string | undefined, fallbackPath: string): string {
  if (explicitPath) {
    return resolveOptionalPath(explicitPath, cwd);
  }

  return fallbackPath;
}

export function resolveOptionalPath(value: string, cwd: string | undefined): string {
  if (!value) {
    return "";
  }

  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(cwd ?? process.cwd(), value);
}

export function normalizeOutputMode(value: unknown): PlaywrightMcpConfig["outputMode"] {
  return String(value ?? "").trim().toLowerCase() === "file" ? "file" : "stdout";
}
