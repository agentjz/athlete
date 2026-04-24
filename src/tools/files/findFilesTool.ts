import fs from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";

import { resolveUserPath } from "../../utils/fs.js";
import { isPathIgnored } from "../../utils/ignore.js";
import { clampNumber, okResult, parseArgs, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const findFilesTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "find_files",
      description: "Find files by path pattern under a local directory. Use this for glob-style file discovery, not for listing directory contents or searching file text.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory to search from. Relative paths resolve from the current working directory.",
          },
          pattern: {
            type: "string",
            description: "Path glob such as **/*.ts, src/**/config*.json, or *.md.",
          },
          limit: {
            type: "number",
            description: "Maximum matching file paths to return.",
          },
        },
        required: ["path", "pattern"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const targetPath = readString(args.path, "path");
    const pattern = readString(args.pattern, "pattern");
    const limit = clampNumber(args.limit, 1, 2_000, 200);
    const resolved = resolveUserPath(targetPath, context.cwd);
    const stats = await fs.stat(resolved);
    const searchRoot = stats.isDirectory() ? resolved : path.dirname(resolved);
    const absoluteMatches = await fg(pattern, {
      cwd: searchRoot,
      absolute: true,
      dot: true,
      onlyFiles: true,
      suppressErrors: true,
      ignore: ["**/.git/**", "**/node_modules/**", "**/dist/**", "**/coverage/**"],
    });

    const filtered = absoluteMatches
      .filter((filePath) => normalizePath(filePath) === normalizePath(resolved) || stats.isDirectory())
      .filter((filePath) => !isPathIgnored(filePath, context.projectContext.ignoreRules))
      .sort((left, right) => left.localeCompare(right));
    const files = filtered.slice(0, limit).map((filePath) => toRelativeDisplayPath(searchRoot, filePath));

    return okResult(
      JSON.stringify(
        {
          path: resolved,
          pattern,
          limit,
          totalMatches: filtered.length,
          truncated: filtered.length > limit,
          files,
        },
        null,
        2,
      ),
    );
  },
};

function toRelativeDisplayPath(root: string, filePath: string): string {
  const relative = path.relative(root, filePath) || path.basename(filePath);
  return relative.replace(/\\/g, "/");
}

function normalizePath(value: string): string {
  return path.normalize(value).toLowerCase();
}
