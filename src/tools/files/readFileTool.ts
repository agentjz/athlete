import { formatFileWithLineNumbers, resolveUserPath } from "../../utils/fs.js";
import { ToolExecutionError } from "../errors.js";
import { inspectTextFile } from "../fileIntrospection.js";
import { findPathSuggestions } from "../pathSuggestions.js";
import { okResult, parseArgs, readOptionalNumber, readString } from "../shared.js";
import { buildToolResultArtifactReadPayload, isToolResultArtifactPath } from "./toolResultArtifact.js";
import { buildFileEditIdentity } from "./editIdentity.js";
import { buildReadFileAnchors } from "./readFileAnchors.js";
import type { RegisteredTool } from "../types.js";

interface ReadWindow {
  start: number;
  endExclusive: number;
  requestedLimit?: number;
}

export const readFileTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a local text file from the local filesystem. Returns numbered lines, continuation metadata, and a stable file identity for follow-up edits. This is not for webpage content.",
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
          offset: {
            type: "number",
            description: "0-based line offset for continuation-friendly reads.",
          },
          limit: {
            type: "number",
            description: "Maximum number of lines to return from the offset.",
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
    const offset = readOptionalNumber(args.offset);
    const limit = readOptionalNumber(args.limit);
    const resolved = resolveUserPath(targetPath, context.cwd);
    let inspected;

    if ((startLine !== undefined || endLine !== undefined) && (offset !== undefined || limit !== undefined)) {
      throw new Error('Use either "start_line/end_line" or "offset/limit" in read_file, not both.');
    }

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

    if (
      startLine === undefined &&
      endLine === undefined &&
      offset === undefined &&
      limit === undefined &&
      isToolResultArtifactPath(resolved, context.projectContext.stateRootDir)
    ) {
      return okResult(
        JSON.stringify(buildToolResultArtifactReadPayload(resolved, inspected), null, 2),
      );
    }

    const lines = (inspected.content ?? "").split(/\r?\n/);
    const readWindow = resolveReadWindow(lines.length, startLine, endLine, offset, limit);
    const fittedEndExclusive = fitWindowWithinBudget(lines, readWindow.start, readWindow.endExclusive, context.config.maxReadBytes);
    const selected = lines.slice(readWindow.start, fittedEndExclusive).join("\n");
    const content = formatFileWithLineNumbers(selected, readWindow.start + 1);
    const hasMore = fittedEndExclusive < lines.length;
    const identity = buildFileEditIdentity(resolved, inspected.content ?? "");

    return okResult(
      JSON.stringify(
        {
          path: resolved,
          readable: true,
          size: inspected.size,
          extension: inspected.extension,
          startLine: readWindow.start + 1,
          endLine: fittedEndExclusive === 0 ? 0 : fittedEndExclusive,
          truncated: hasMore,
          identity,
          anchors: buildReadFileAnchors(resolved, lines.slice(readWindow.start, fittedEndExclusive), readWindow.start + 1),
          content,
          continuation: hasMore
            ? {
                hasMore: true,
                nextOffset: fittedEndExclusive,
                nextStartLine: fittedEndExclusive + 1,
                limit: readWindow.requestedLimit ?? Math.max(1, fittedEndExclusive - readWindow.start),
                remainingLines: lines.length - fittedEndExclusive,
                suggestedArgs: {
                  path: targetPath,
                  offset: fittedEndExclusive,
                  limit: readWindow.requestedLimit ?? Math.max(1, fittedEndExclusive - readWindow.start),
                },
              }
            : undefined,
        },
        null,
        2,
      ),
    );
  },
};

function resolveReadWindow(
  totalLines: number,
  startLine: number | undefined,
  endLine: number | undefined,
  offset: number | undefined,
  limit: number | undefined,
): ReadWindow {
  if (offset !== undefined || limit !== undefined) {
    const start = Math.max(0, offset ?? 0);
    const requestedLimit = Math.max(1, (limit ?? totalLines) || 1);
    return {
      start,
      endExclusive: Math.min(totalLines, start + requestedLimit),
      requestedLimit,
    };
  }

  const start = startLine ? Math.max(startLine - 1, 0) : 0;
  return {
    start,
    endExclusive: endLine ? Math.min(totalLines, Math.max(endLine, start + 1)) : totalLines,
  };
}

function fitWindowWithinBudget(
  lines: string[],
  start: number,
  requestedEndExclusive: number,
  maxChars: number,
): number {
  if (start >= lines.length) {
    return lines.length;
  }

  let endExclusive = Math.max(start + 1, requestedEndExclusive);

  while (endExclusive > start + 1) {
    const content = formatFileWithLineNumbers(lines.slice(start, endExclusive).join("\n"), start + 1);
    if (content.length <= maxChars) {
      return endExclusive;
    }

    endExclusive -= 1;
  }

  const singleLine = formatFileWithLineNumbers(lines.slice(start, Math.min(lines.length, start + 1)).join("\n"), start + 1);
  if (singleLine.length <= maxChars) {
    return Math.min(lines.length, start + 1);
  }

  return Math.min(lines.length, start + 1);
}
