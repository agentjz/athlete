import fs from "node:fs/promises";
import path from "node:path";

import { ensureProjectStateDirectories } from "../project/statePaths.js";
import { okResult } from "../tools/core/shared.js";
import type { ToolExecutionResult } from "../types.js";

export async function ensureExtensionDir(rootDir: string, extensionId: string): Promise<string> {
  const paths = await ensureProjectStateDirectories(rootDir);
  const dir = path.join(paths.extensionsDir, extensionId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function jsonResult(value: unknown): ToolExecutionResult {
  return okResult(`${JSON.stringify(value, null, 2)}\n`);
}

export function changedJsonResult(value: unknown, changedPaths: string[]): ToolExecutionResult {
  return okResult(`${JSON.stringify(value, null, 2)}\n`, { changedPaths });
}

export function sanitizeStateSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function sessionExtensionDir(
  rootDir: string,
  extensionId: string,
  sessionId: string,
): Promise<string> {
  return path.join(await ensureExtensionDir(rootDir, extensionId), sanitizeStateSegment(sessionId));
}
