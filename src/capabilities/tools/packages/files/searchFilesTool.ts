import fs from "node:fs/promises";

import fg from "fast-glob";

import { resolveUserPath } from "../../../../utils/fs.js";
import { isPathIgnored } from "../../../../utils/ignore.js";
import { toToolRelativePath } from "../../core/pathDisplay.js";
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
          mode: {
            type: "string",
            enum: ["files", "count", "matches"],
            description: "Output mode. files returns matching files only, count returns per-file counts, matches returns matching lines with optional context. Defaults to files.",
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
    const mode = readSearchMode(args.mode);
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
      absolutePath: string;
      line: number;
      text: string;
      before: string[];
      after: string[];
      lineTruncated: boolean;
      readArgs: {
        path: string;
        offset: number;
        limit: number;
      };
    }> = [];
    const fileSummaries = new Map<string, {
      path: string;
      absolutePath: string;
      matches: number;
      firstLine: number;
      readArgs: {
        path: string;
        offset: number;
        limit: number;
      };
    }>();
    let totalMatches = 0;
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

        if (totalMatches >= maxResults) {
          truncated = true;
          break outer;
        }

        const lineNumber = index + 1;
        const displayPath = toToolRelativePath(context.cwd, filePath);
        const readArgs = buildReadArgs(displayPath, lineNumber, contextLines, lines.length);
        totalMatches += 1;
        const existingSummary = fileSummaries.get(filePath);
        if (existingSummary) {
          existingSummary.matches += 1;
        } else {
          fileSummaries.set(filePath, {
            path: displayPath,
            absolutePath: filePath,
            matches: 1,
            firstLine: lineNumber,
            readArgs,
          });
        }

        matches.push({
          path: toToolRelativePath(context.cwd, filePath),
          absolutePath: filePath,
          line: lineNumber,
          text: truncateLine(line),
          before: lines.slice(Math.max(0, index - contextLines), index).map((value) => truncateLine(value)),
          after: lines.slice(index + 1, index + 1 + contextLines).map((value) => truncateLine(value)),
          lineTruncated: line.length > MAX_MATCH_LINE_CHARS,
          readArgs,
        });
      }
    }

    const files = Array.from(fileSummaries.values());
    const basePayload = {
      searched: filePaths.length,
      pattern,
      glob,
      literal,
      ignoreCase: !caseSensitive,
      context: contextLines,
      limit: maxResults,
      truncated,
      mode,
      matchedFilesCount: files.length,
      totalMatches,
    };
    const payload =
      mode === "files"
        ? {
            ...basePayload,
            files,
          }
        : mode === "count"
          ? {
              ...basePayload,
              files: files.map((file) => ({
                path: file.path,
                matches: file.matches,
              })),
            }
          : {
              ...basePayload,
              matches,
            };

    return okResult(
      JSON.stringify(
        payload,
        null,
        2,
      ),
    );
  },
};

const MAX_MATCH_LINE_CHARS = 500;
type SearchMode = "files" | "count" | "matches";

function readSearchMode(value: unknown): SearchMode {
  if (value === undefined) {
    return "files";
  }

  if (value === "files" || value === "count" || value === "matches") {
    return value;
  }

  throw new Error('Tool argument "mode" must be "files", "count", or "matches".');
}

function truncateLine(value: string): string {
  return value.length <= MAX_MATCH_LINE_CHARS
    ? value
    : `${value.slice(0, MAX_MATCH_LINE_CHARS)}... [line truncated]`;
}

function buildReadArgs(
  displayPath: string,
  line: number,
  contextLines: number,
  totalLines: number,
): {
  path: string;
  offset: number;
  limit: number;
} {
  const offset = Math.max(1, line - contextLines);
  const endLine = Math.min(totalLines, line + contextLines);
  return {
    path: displayPath,
    offset,
    limit: Math.max(1, endLine - offset + 1),
  };
}
