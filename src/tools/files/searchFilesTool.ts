import fs from "node:fs/promises";

import fg from "fast-glob";

import { assertPathAllowed } from "../../utils/fs.js";
import { isPathIgnored } from "../../utils/ignore.js";
import { buildSearchPattern, clampNumber, okResult, parseArgs, readBoolean, readString, tryReadTextFile } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const searchFilesTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "search_files",
      description: "Search text in files under a path. Use before editing when you need to locate code.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory or file path to search in.",
          },
          pattern: {
            type: "string",
            description: "Plain text or regular expression pattern.",
          },
          glob: {
            type: "string",
            description: "Optional glob like src/**/*.ts.",
          },
          case_sensitive: {
            type: "boolean",
            description: "Whether search is case-sensitive.",
          },
          max_results: {
            type: "number",
            description: "Maximum matches to return.",
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
    const glob = typeof args.glob === "string" ? args.glob : "**/*";
    const caseSensitive = readBoolean(args.case_sensitive, false);
    const maxResults = clampNumber(args.max_results, 1, 1_000, context.config.maxSearchResults);
    const resolved = assertPathAllowed(targetPath, context.cwd, context.config);
    const stats = await fs.stat(resolved);

    const regex = buildSearchPattern(pattern, caseSensitive);
    const filePaths = stats.isDirectory()
      ? (
          await fg(glob, {
            cwd: resolved,
            absolute: true,
            dot: true,
            suppressErrors: true,
            onlyFiles: true,
            ignore: ["**/.git/**", "**/node_modules/**", "**/dist/**", "**/coverage/**"],
          })
        )
          .filter((filePath) => !isPathIgnored(filePath, context.projectContext.ignoreRules))
          .slice(0, 2_000)
      : [resolved];

    const matches: Array<{ path: string; line: number; text: string }> = [];

    for (const filePath of filePaths) {
      if (matches.length >= maxResults) {
        break;
      }

      const content = await tryReadTextFile(filePath, context.config.maxReadBytes);
      if (!content) {
        continue;
      }

      const lines = content.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        if (matches.length >= maxResults) {
          break;
        }

        const line = lines[index] ?? "";
        regex.lastIndex = 0;
        if (regex.test(line)) {
          matches.push({
            path: filePath,
            line: index + 1,
            text: line.slice(0, 500),
          });
        }
      }
    }

    return okResult(
      JSON.stringify(
        {
          searched: filePaths.length,
          pattern,
          matches,
        },
        null,
        2,
      ),
    );
  },
};
