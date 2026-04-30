import { buildSearchPattern, clampNumber, okResult, parseArgs, readBoolean, readString } from "../../core/shared.js";
import {
  collectCodeFiles,
  readCodeLines,
  truncateLine,
} from "./codeFacts.js";
import type { CodeLineFact } from "./codeFacts.js";
import type { RegisteredTool } from "../../core/types.js";

export const codePatternTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "code_pattern",
      description: "Search local source files for structural code line patterns. Use this for code-shape evidence such as async functions, imports, exports, classes, or call sites. It does not edit files.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File or directory to inspect. Relative paths resolve from the current working directory.",
          },
          pattern: {
            type: "string",
            description: "Line-level regular expression or literal text pattern.",
          },
          glob: {
            type: "string",
            description: "Optional source file glob. Defaults to common code extensions.",
          },
          literal: {
            type: "boolean",
            description: "Treat pattern as literal text instead of regular expression syntax.",
          },
          ignoreCase: {
            type: "boolean",
            description: "Whether pattern matching is case-insensitive.",
          },
          context: {
            type: "number",
            description: "How many surrounding lines readArgs should include.",
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
    const glob = typeof args.glob === "string" && args.glob.length > 0 ? args.glob : undefined;
    const literal = readBoolean(args.literal, false);
    const ignoreCase = readBoolean(args.ignoreCase, false);
    const contextLines = clampNumber(args.context, 0, 10, 2);
    const limit = clampNumber(args.limit, 1, 2_000, 200);
    const regex = buildSearchPattern(pattern, !ignoreCase, literal);
    const { root, files } = await collectCodeFiles(context, targetPath, glob);
    const matches: CodeLineFact[] = [];
    let scannedFiles = 0;

    for (const filePath of files) {
      const lines = await readCodeLines(filePath, context.config.maxReadBytes);
      if (!lines) {
        continue;
      }

      scannedFiles += 1;
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        regex.lastIndex = 0;
        if (!regex.test(line)) {
          continue;
        }

        const lineNumber = index + 1;
        matches.push({
          path: filePath,
          line: lineNumber,
          text: truncateLine(line),
          readArgs: {
            path: filePath,
            start_line: Math.max(1, lineNumber - contextLines),
            end_line: Math.min(lines.length, lineNumber + contextLines),
          },
        });

        if (matches.length >= limit) {
          break;
        }
      }

      if (matches.length >= limit) {
        break;
      }
    }

    return okResult(
      JSON.stringify(
        {
          path: root,
          glob: glob ?? null,
          pattern,
          literal,
          ignoreCase,
          context: contextLines,
          searchedFiles: files.length,
          scannedTextFiles: scannedFiles,
          limit,
          totalReturned: Math.min(matches.length, limit),
          truncated: matches.length >= limit,
          matches: matches.slice(0, limit),
        },
        null,
        2,
      ),
    );
  },
};
