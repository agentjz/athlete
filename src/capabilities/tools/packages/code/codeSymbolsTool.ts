import { clampNumber, okResult, parseArgs, readBoolean, readString } from "../../core/shared.js";
import {
  collectCodeFiles,
  extractCodeSymbols,
  filterByQuery,
  readCodeLines,
} from "./codeFacts.js";
import type { CodeSymbolFact, CodeSymbolKind } from "./codeFacts.js";
import type { RegisteredTool } from "../../core/types.js";

export const codeSymbolsTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "code_symbols",
      description: "Return code symbol facts from local source files. Use this to inspect declarations and file structure without reading full files.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File or directory to inspect. Relative paths resolve from the current working directory.",
          },
          query: {
            type: "string",
            description: "Optional symbol name or text pattern to filter returned declarations.",
          },
          glob: {
            type: "string",
            description: "Optional source file glob. Defaults to common code extensions.",
          },
          kind: {
            type: "string",
            enum: ["class", "function", "method", "interface", "type", "enum", "const", "import", "export"],
            description: "Optional symbol kind filter.",
          },
          literal: {
            type: "boolean",
            description: "Treat query as literal text instead of regular expression syntax.",
          },
          ignoreCase: {
            type: "boolean",
            description: "Whether query filtering is case-insensitive.",
          },
          limit: {
            type: "number",
            description: "Maximum symbols to return.",
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
    const query = typeof args.query === "string" && args.query.length > 0 ? args.query : undefined;
    const glob = typeof args.glob === "string" && args.glob.length > 0 ? args.glob : undefined;
    const kind = readSymbolKind(args.kind);
    const literal = readBoolean(args.literal, false);
    const ignoreCase = readBoolean(args.ignoreCase, false);
    const limit = clampNumber(args.limit, 1, 2_000, 200);
    const { root, files } = await collectCodeFiles(context, targetPath, glob);

    const symbols: CodeSymbolFact[] = [];
    let scannedFiles = 0;

    for (const filePath of files) {
      const lines = await readCodeLines(filePath, context.config.maxReadBytes);
      if (!lines) {
        continue;
      }

      scannedFiles += 1;
      const extracted = extractCodeSymbols(filePath, lines).filter((symbol) => !kind || symbol.kind === kind);
      symbols.push(...filterByQuery(extracted, query, literal, ignoreCase));
      if (symbols.length >= limit) {
        break;
      }
    }

    return okResult(
      JSON.stringify(
        {
          path: root,
          glob: glob ?? null,
          query: query ?? null,
          kind: kind ?? null,
          searchedFiles: files.length,
          scannedTextFiles: scannedFiles,
          limit,
          totalReturned: Math.min(symbols.length, limit),
          truncated: symbols.length > limit,
          symbols: symbols.slice(0, limit),
        },
        null,
        2,
      ),
    );
  },
};

function readSymbolKind(value: unknown): CodeSymbolKind | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    value === "class" ||
    value === "function" ||
    value === "method" ||
    value === "interface" ||
    value === "type" ||
    value === "enum" ||
    value === "const" ||
    value === "import" ||
    value === "export"
  ) {
    return value;
  }

  throw new Error('Tool argument "kind" must be a supported code symbol kind.');
}
