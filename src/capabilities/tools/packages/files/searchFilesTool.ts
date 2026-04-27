import fs from "node:fs/promises";

import fg from "fast-glob";

import { resolveUserPath } from "../../../../utils/fs.js";
import { isPathIgnored } from "../../../../utils/ignore.js";
import { buildSearchPattern, clampNumber, okResult, parseArgs, readBoolean, readString, tryReadTextFile } from "../../core/shared.js";
import type { RegisteredTool } from "../../core/types.js";

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
          context: {
            type: "number",
            description: "How many surrounding lines to return before and after each match.",
          },
          literal: {
            type: "boolean",
            description: "Treat pattern as literal text instead of regular expression syntax.",
          },
          ignoreCase: {
            type: "boolean",
            description: "Whether search is case-insensitive.",
          },
          limit: {
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
    const literal = readBoolean(args.literal, false);
    const contextLines = clampNumber(args.context, 0, 8, 0);
    const caseSensitive = !readBoolean(args.ignoreCase, false);
    const maxResults = clampNumber(args.limit, 1, 1_000, context.config.maxSearchResults);
    const resolved = resolveUserPath(targetPath, context.cwd);
    const stats = await fs.stat(resolved);

    const regex = buildSearchPattern(pattern, caseSensitive, literal);
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

    const matches: Array<{
      path: string;
      line: number;
      text: string;
      before: string[];
      after: string[];
      lineTruncated: boolean;
    }> = [];
    let truncated = false;

    outer: for (const filePath of filePaths) {
      const content = await tryReadTextFile(filePath, context.config.maxReadBytes);
      if (!content) {
        continue;
      }

      const lines = content.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        regex.lastIndex = 0;
        if (!regex.test(line)) {
          continue;
        }

        if (matches.length >= maxResults) {
          truncated = true;
          break outer;
        }

        matches.push({
          path: filePath,
          line: index + 1,
          text: truncateLine(line),
          before: lines.slice(Math.max(0, index - contextLines), index).map((value) => truncateLine(value)),
          after: lines.slice(index + 1, index + 1 + contextLines).map((value) => truncateLine(value)),
          lineTruncated: line.length > MAX_MATCH_LINE_CHARS,
        });
      }
    }

    return okResult(
      JSON.stringify(
        {
          searched: filePaths.length,
          pattern,
          glob,
          literal,
          ignoreCase: !caseSensitive,
          context: contextLines,
          limit: maxResults,
          truncated,
          matches,
        },
        null,
        2,
      ),
    );
  },
};

const MAX_MATCH_LINE_CHARS = 500;

function truncateLine(value: string): string {
  return value.length <= MAX_MATCH_LINE_CHARS
    ? value
    : `${value.slice(0, MAX_MATCH_LINE_CHARS)}... [line truncated]`;
}
