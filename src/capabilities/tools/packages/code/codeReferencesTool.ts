import { clampNumber, okResult, parseArgs, readString } from "../../core/shared.js";
import {
  collectCodeFiles,
  findIdentifierReferences,
  readCodeLines,
} from "./codeFacts.js";
import type { CodeLineFact } from "./codeFacts.js";
import type { RegisteredTool } from "../../core/types.js";

export const codeReferencesTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "code_references",
      description: "Find identifier reference facts across local source files. Use this after identifying a symbol name; it returns line evidence and read continuation args, not edit decisions.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File or directory to inspect. Relative paths resolve from the current working directory.",
          },
          symbol: {
            type: "string",
            description: "Identifier to find as a whole-word code reference.",
          },
          glob: {
            type: "string",
            description: "Optional source file glob. Defaults to common code extensions.",
          },
          context: {
            type: "number",
            description: "How many surrounding lines readArgs should include.",
          },
          limit: {
            type: "number",
            description: "Maximum references to return.",
          },
        },
        required: ["path", "symbol"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const targetPath = readString(args.path, "path");
    const symbol = readString(args.symbol, "symbol");
    const glob = typeof args.glob === "string" && args.glob.length > 0 ? args.glob : undefined;
    const contextLines = clampNumber(args.context, 0, 10, 2);
    const limit = clampNumber(args.limit, 1, 2_000, 200);
    const { root, files } = await collectCodeFiles(context, targetPath, glob);
    const references: CodeLineFact[] = [];
    let scannedFiles = 0;

    for (const filePath of files) {
      const lines = await readCodeLines(filePath, context.config.maxReadBytes);
      if (!lines) {
        continue;
      }

      scannedFiles += 1;
      references.push(...findIdentifierReferences(filePath, lines, symbol, contextLines));
      if (references.length >= limit) {
        break;
      }
    }

    return okResult(
      JSON.stringify(
        {
          path: root,
          glob: glob ?? null,
          symbol,
          context: contextLines,
          searchedFiles: files.length,
          scannedTextFiles: scannedFiles,
          limit,
          totalReturned: Math.min(references.length, limit),
          truncated: references.length > limit,
          references: references.slice(0, limit),
        },
        null,
        2,
      ),
    );
  },
};
