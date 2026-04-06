import path from "node:path";

import { readDocxDocument } from "../../documents/docx/index.js";
import { assertPathAllowed, truncateText } from "../../utils/fs.js";
import { replaceExtension } from "../docxShared.js";
import { ToolExecutionError } from "../errors.js";
import { findPathSuggestions } from "../pathSuggestions.js";
import { okResult, parseArgs, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const readDocxTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "read_docx",
      description: "Read a .docx Word document and return text, structure summary, and warnings.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the .docx file.",
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
    const resolved = assertPathAllowed(targetPath, context.cwd, context.config);
    const extension = path.extname(resolved).toLowerCase();

    if (extension === ".doc" || extension === ".docm") {
      return okResult(
        JSON.stringify(
          {
            path: resolved,
            readable: false,
            reason: `Word files in ${extension} format are not supported.`,
            action: "convert_to_docx_first",
            suggestedPath: replaceExtension(resolved, ".docx"),
          },
          null,
          2,
        ),
      );
    }

    if (extension !== ".docx") {
      throw new ToolExecutionError(`Unsupported Word document format: ${extension || "unknown"}`, {
        code: "UNSUPPORTED_WORD_FORMAT",
        details: {
          requestedPath: targetPath,
          supportedExtensions: [".docx"],
        },
      });
    }

    try {
      const document = await readDocxDocument(resolved);
      const maxChars = context.config.maxReadBytes;

      return okResult(
        JSON.stringify(
          {
            path: resolved,
            readable: true,
            format: "docx",
            size: document.size,
            title: document.title,
            statistics: document.statistics,
            outline: document.outline.slice(0, 50),
            sections: document.sections.slice(0, 50),
            placeholders: document.placeholders,
            messages: document.messages.slice(0, 20),
            content: truncateText(document.rawText, maxChars),
            contentTruncated: document.rawText.length > maxChars,
            markdownPreview: truncateText(document.markdownPreview, Math.max(2_000, Math.floor(maxChars / 2))),
            markdownPreviewTruncated:
              document.markdownPreview.length > Math.max(2_000, Math.floor(maxChars / 2)),
            htmlPreview: truncateText(document.html, Math.max(2_000, Math.floor(maxChars / 2))),
            htmlPreviewTruncated: document.html.length > Math.max(2_000, Math.floor(maxChars / 2)),
          },
          null,
          2,
        ),
      );
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

      throw new ToolExecutionError(
        `Failed to read .docx file: ${error instanceof Error ? error.message : String(error)}`,
        {
          code: "DOCX_READ_FAILED",
          details: {
            requestedPath: targetPath,
          },
        },
      );
    }
  },
};
