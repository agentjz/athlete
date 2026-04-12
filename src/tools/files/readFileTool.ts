import fs from "node:fs/promises";

import { formatFileWithLineNumbers, resolveUserPath, truncateText } from "../../utils/fs.js";
import { ToolExecutionError } from "../errors.js";
import { inspectTextFile } from "../fileIntrospection.js";
import { buildToolResultArtifactReadPayload, isToolResultArtifactPath } from "./toolResultArtifact.js";
import { findPathSuggestions } from "../pathSuggestions.js";
import { okResult, parseArgs, readOptionalNumber, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const readFileTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a local text file from the local filesystem. Returns numbered lines to make edits easier, and is not for webpage content.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to read.",
          },
          start_line: {
            type: "number",
            description: "1-based start line. Optional.",
          },
          end_line: {
            type: "number",
            description: "1-based end line. Optional.",
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
    const startLine = readOptionalNumber(args.start_line);
    const endLine = readOptionalNumber(args.end_line);
    const resolved = resolveUserPath(targetPath, context.cwd);
    let inspected;

    try {
      inspected = await inspectTextFile(resolved, context.config.maxReadBytes);
    } catch (error) {
      const errno = error as NodeJS.ErrnoException;
      if (errno.code === "ENOENT") {
        const suggestions = await findPathSuggestions(context.cwd, targetPath, context.projectContext);
        throw new ToolExecutionError(`File not found: ${targetPath}`, {
          code: "ENOENT",
          details: {
            requestedPath: targetPath,
            suggestions,
          },
        });
      }

      throw error;
    }

    if (!inspected.readable) {
      return okResult(
        JSON.stringify(
          {
            path: resolved,
            readable: false,
            reason: inspected.reason,
            size: inspected.size,
            extension: inspected.extension,
            routeCode: inspected.routeCode,
            action: inspected.action ?? "skip_file_content",
            suggestedCapability: inspected.suggestedCapability,
            documentKind: inspected.documentKind,
            suggestedPath: inspected.suggestedPath,
          },
          null,
          2,
        ),
      );
    }

    if (!startLine && !endLine && isToolResultArtifactPath(resolved, context.projectContext.stateRootDir)) {
      return okResult(
        JSON.stringify(buildToolResultArtifactReadPayload(resolved, inspected), null, 2),
      );
    }

    const lines = (inspected.content ?? "").split(/\r?\n/);
    const sliceStart = startLine ? Math.max(startLine - 1, 0) : 0;
    const sliceEnd = endLine ? Math.min(endLine, lines.length) : lines.length;
    const selected = lines.slice(sliceStart, sliceEnd).join("\n");
    const formatted = formatFileWithLineNumbers(
      truncateText(selected, context.config.maxReadBytes),
      sliceStart + 1,
    );

    return okResult(
      JSON.stringify(
        {
          path: resolved,
          readable: true,
          size: inspected.size,
          extension: inspected.extension,
          startLine: sliceStart + 1,
          endLine: sliceStart + Math.max(1, selected.split(/\r?\n/).length),
          content: formatted,
        },
        null,
        2,
      ),
    );
  },
};
