import fs from "node:fs/promises";
import path from "node:path";

import { diffLines } from "diff";

import { truncateText } from "../utils/fs.js";
import type { RegisteredTool } from "./types.js";
import type { ToolExecutionMetadata, ToolExecutionResult } from "../types.js";

export function register(
  registry: Map<string, RegisteredTool>,
  tool: RegisteredTool,
): void {
  registry.set(tool.definition.function.name, tool);
}

export function parseArgs(rawArgs: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawArgs) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Arguments must be a JSON object.");
    }

    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Invalid tool arguments: ${(error as Error).message}`);
  }
}

export function readString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Tool argument "${field}" must be a non-empty string.`);
  }

  return value;
}

export function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function readRequiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Tool argument "${field}" must be a boolean.`);
  }

  return value;
}

export function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined;
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export function okResult(output: string, metadata?: ToolExecutionMetadata): ToolExecutionResult {
  return {
    ok: true,
    output,
    metadata,
  };
}

export function buildDiffPreview(before: string, after: string): string {
  const lines: string[] = [];

  for (const part of diffLines(before, after)) {
    const marker = part.added ? "+" : part.removed ? "-" : " ";
    for (const line of part.value.split(/\r?\n/)) {
      if (line.length === 0 && marker === " ") {
        continue;
      }

      lines.push(`${marker} ${line}`);
      if (lines.length >= 200) {
        return `${lines.join("\n")}\n... [diff truncated]`;
      }
    }
  }

  return lines.join("\n");
}

export async function walkDirectory(
  targetPath: string,
  recursive: boolean,
  maxEntries: number,
  options: {
    shouldIgnore?: (targetPath: string, isDirectory: boolean) => boolean;
  } = {},
): Promise<Array<{
  path: string;
  type: "file" | "directory";
  size?: number;
  extension?: string;
  modifiedAt?: string;
}>> {
  const results: Array<{
    path: string;
    type: "file" | "directory";
    size?: number;
    extension?: string;
    modifiedAt?: string;
  }> = [];
  const queue = [targetPath];

  while (queue.length > 0 && results.length < maxEntries) {
    const currentPath = queue.shift();
    if (!currentPath) {
      break;
    }

    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (results.length >= maxEntries) {
        break;
      }

      const entryPath = path.join(currentPath, entry.name);
      if (options.shouldIgnore?.(entryPath, entry.isDirectory())) {
        continue;
      }

      const stat = await fs.stat(entryPath);
      if (entry.isDirectory()) {
        results.push({
          path: entryPath,
          type: "directory",
          modifiedAt: stat.mtime.toISOString(),
        });
        if (recursive) {
          queue.push(entryPath);
        }
      } else {
        results.push({
          path: entryPath,
          type: "file",
          size: stat.size,
          extension: path.extname(entryPath).toLowerCase(),
          modifiedAt: stat.mtime.toISOString(),
        });
      }
    }
  }

  return results;
}

export async function tryReadTextFile(filePath: string, maxBytes: number): Promise<string | null> {
  try {
    const buffer = await fs.readFile(filePath);
    if (buffer.includes(0)) {
      return null;
    }

    return truncateText(buffer.toString("utf8"), maxBytes);
  } catch {
    return null;
  }
}

export function buildSearchPattern(pattern: string, caseSensitive: boolean): RegExp {
  try {
    return new RegExp(pattern, caseSensitive ? "g" : "gi");
  } catch {
    return new RegExp(escapeRegex(pattern), caseSensitive ? "g" : "gi");
  }
}

export function countOccurrences(input: string, search: string): number {
  if (search.length === 0) {
    return 0;
  }

  let count = 0;
  let offset = 0;
  while (offset <= input.length) {
    const index = input.indexOf(search, offset);
    if (index === -1) {
      break;
    }

    count += 1;
    offset = index + search.length;
  }

  return count;
}

export function normalizeDiffPath(fileName: string | undefined): string | null {
  if (!fileName || fileName === "/dev/null") {
    return null;
  }

  return fileName.replace(/^([ab])\//, "");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
