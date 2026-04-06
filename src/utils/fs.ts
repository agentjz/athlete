import fs from "node:fs/promises";
import path from "node:path";

import type { RuntimeConfig } from "../types.js";

export async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export function resolveUserPath(inputPath: string, cwd: string): string {
  if (path.isAbsolute(inputPath)) {
    return path.normalize(inputPath);
  }

  return path.resolve(cwd, inputPath);
}

export function assertPathAllowed(targetPath: string, cwd: string, config: RuntimeConfig): string {
  const resolved = resolveUserPath(targetPath, cwd);

  if (config.allowedRoots.includes("*")) {
    return resolved;
  }

  const allowedRoots = config.allowedRoots.map((root) => resolveUserPath(root, cwd));

  for (const root of allowedRoots) {
    const relative = path.relative(root, resolved);
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
      return resolved;
    }
  }

  throw new Error(`Path not allowed by config.allowedRoots: ${resolved}`);
}

export async function ensureParentDirectory(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export function truncateText(input: string, maxChars: number): string {
  if (input.length <= maxChars) {
    return input;
  }

  return `${input.slice(0, maxChars)}\n\n... [truncated ${input.length - maxChars} chars]`;
}

export function formatFileWithLineNumbers(content: string, startLine = 1): string {
  return content
    .split(/\r?\n/)
    .map((line, index) => `${String(startLine + index).padStart(4, " ")} | ${line}`)
    .join("\n");
}
