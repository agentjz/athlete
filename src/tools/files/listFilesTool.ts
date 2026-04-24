import fs from "node:fs/promises";

import { resolveUserPath } from "../../utils/fs.js";
import { isPathIgnored } from "../../utils/ignore.js";
import { clampNumber, okResult, parseArgs, readBoolean, readString, walkDirectory } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const listFilesTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "list_files",
      description: "List local files or directories on the local filesystem. Use this to explore a folder before reading or editing local files, not for webpages.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File or directory path. Relative paths resolve from the current working directory.",
          },
          recursive: {
            type: "boolean",
            description: "Whether to descend into subdirectories.",
          },
          max_entries: {
            type: "number",
            description: "Maximum entries to return.",
          },
          compact: {
            type: "boolean",
            description: "Return a lighter directory confirmation view with minimal entry metadata.",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const targetPath = readString(args.path, "path");
    const recursive = readBoolean(args.recursive, false);
    const compact = readBoolean(args.compact, false);
    const maxEntries = clampNumber(args.max_entries, 1, 1_000, 200);
    const resolved = resolveUserPath(targetPath, context.cwd);
    const stats = await fs.stat(resolved);

    if (stats.isFile()) {
      return okResult(
        JSON.stringify(
          compact
            ? {
                path: resolved,
                type: "file",
                compact: true,
              }
            : {
                path: resolved,
                type: "file",
                size: stats.size,
                modifiedAt: stats.mtime.toISOString(),
              },
          null,
          2,
        ),
      );
    }

    const entries = await walkDirectory(resolved, recursive, maxEntries, {
      shouldIgnore: (entryPath, isDirectory) =>
        entryPath !== resolved && isPathIgnored(entryPath, context.projectContext.ignoreRules, isDirectory),
    });

    return okResult(
      JSON.stringify(
        {
          path: resolved,
          recursive,
          compact,
          total: entries.length,
          entries: compact
            ? entries.map((entry) => ({
                path: entry.path,
                type: entry.type,
              }))
            : entries,
        },
        null,
        2,
      ),
    );
  },
};
