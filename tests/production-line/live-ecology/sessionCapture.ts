import path from "node:path";

import { getAppPaths } from "../../../src/config/paths.js";

export function getLiveTaskSessionsDir(rootDir = process.cwd()): string {
  return path.join(getAppPaths(rootDir).dataDir, "sessions");
}

export function extractCloseoutSessionId(output: string): string {
  const jsonLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.endsWith("}"))
    .at(-1);

  if (jsonLine) {
    const parsed = safeParseRecord(jsonLine);
    if (typeof parsed?.sessionId === "string" && parsed.sessionId.trim()) {
      return parsed.sessionId.trim();
    }
  }

  const explicit = [...output.matchAll(/SESSION_ID=(\S+)/g)].at(-1)?.[1];
  if (explicit) {
    return explicit;
  }

  return [...output.matchAll(/session:\s*(\S+)/g)].at(-1)?.[1] ?? "";
}

function safeParseRecord(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}
