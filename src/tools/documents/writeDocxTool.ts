import fs from "node:fs/promises";
import path from "node:path";

import {
  applyTemplateVariables,
  buildDocxBuffer,
  readDocxDocument,
  renderDocxSourcePreview,
} from "../../documents/docx/index.js";
import { ensureParentDirectory, fileExists, resolveUserPath, truncateText } from "../../utils/fs.js";
import { recordToolChange } from "../changeTracking.js";
import { readDocxSourceFormat, readTemplateVariables, replaceExtension } from "../docxShared.js";
import { ToolExecutionError } from "../errors.js";
import { buildDiffPreview, okResult, parseArgs, readBoolean, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const writeDocxTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "write_docx",
      description: "Create or overwrite a .docx Word document from plain text or markdown.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Target .docx file path.",
          },
          content: {
            type: "string",
            description: "Source content to write into the document.",
          },
          format: {
            type: "string",
            description: "Content format: plain_text or markdown.",
            enum: ["plain_text", "markdown"],
          },
          title: {
            type: "string",
            description: "Optional document title metadata.",
          },
          description: {
            type: "string",
            description: "Optional document description metadata.",
          },
          variables: {
            type: "object",
            description: "Optional template variables used to replace placeholders like {{name}}.",
            additionalProperties: true,
          },
          create_directories: {
            type: "boolean",
            description: "Whether to create parent directories automatically.",
          },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const targetPath = readString(args.path, "path");
    const content = readString(args.content, "content");
    const format = readDocxSourceFormat(args.format);
    const variables = readTemplateVariables(args.variables);
    const titleTemplate = typeof args.title === "string" ? args.title.trim() : undefined;
    const descriptionTemplate = typeof args.description === "string" ? args.description.trim() : undefined;
    const createDirectories = readBoolean(args.create_directories, true);
    const resolved = resolveUserPath(targetPath, context.cwd);
    const extension = path.extname(resolved).toLowerCase();

    if (extension === ".doc" || extension === ".docm") {
      throw new ToolExecutionError(`Word output in ${extension} format is not supported. Write a .docx file instead.`, {
        code: "DOC_CONVERSION_REQUIRED",
        details: {
          requestedPath: targetPath,
          suggestedPath: replaceExtension(resolved, ".docx"),
        },
      });
    }

    if (extension !== ".docx") {
      throw new ToolExecutionError(`write_docx requires a .docx path, got: ${extension || "unknown"}`, {
        code: "INVALID_DOCX_OUTPUT_PATH",
        details: {
          requestedPath: targetPath,
          suggestedPath: resolved.endsWith(".") ? `${resolved}docx` : `${resolved}.docx`,
        },
      });
    }

    const existed = await fileExists(resolved);
    const beforeBuffer = existed ? await fs.readFile(resolved) : undefined;
    const beforeText = existed ? await tryReadExistingDocxText(resolved) : "";
    const renderedContent = applyTemplateVariables(content, variables);
    const renderedTitle = titleTemplate ? applyTemplateVariables(titleTemplate, variables) : undefined;
    const renderedDescription = descriptionTemplate
      ? applyTemplateVariables(descriptionTemplate, variables)
      : undefined;
    const afterText = renderDocxSourcePreview(renderedContent.content, format);
    const preview = buildDiffPreview(beforeText, afterText);
    const buffer = await buildDocxBuffer({
      title: renderedTitle?.content,
      description: renderedDescription?.content,
      creator: "Deadmouse",
      format,
      content: renderedContent.content,
    });

    if (createDirectories) {
      await ensureParentDirectory(resolved);
    }

    await fs.writeFile(resolved, buffer);
    const changeRecord = await recordToolChange(context, {
      toolName: "write_docx",
      summary: `write_docx ${resolved}`,
      preview: truncateText(preview || afterText, 6_000),
      operations: [
        {
          path: resolved,
          kind: existed ? "update" : "create",
          binary: true,
          preview: truncateText(preview || afterText, 6_000),
          beforeData: beforeBuffer,
          afterData: buffer,
        },
      ],
    });

    return okResult(
      JSON.stringify(
        {
          path: resolved,
          existed,
          format,
          bytes: buffer.length,
          title: renderedTitle?.content,
          variablesApplied: renderedContent.usedKeys,
          missingVariables: [
            ...new Set([
              ...renderedContent.missingKeys,
              ...(renderedTitle?.missingKeys ?? []),
              ...(renderedDescription?.missingKeys ?? []),
            ]),
          ],
          changeId: changeRecord.change?.id,
          changeHistoryWarning: changeRecord.warning,
          preview: truncateText(preview || afterText, 6_000),
        },
        null,
        2,
      ),
      {
        changedPaths: [resolved],
        changeId: changeRecord.change?.id,
      },
    );
  },
};

async function tryReadExistingDocxText(filePath: string): Promise<string> {
  try {
    const document = await readDocxDocument(filePath);
    return document.rawText;
  } catch {
    return "";
  }
}
