import fs from "node:fs/promises";
import path from "node:path";

import {
  applyTemplateVariables,
  buildDocxBuffer,
  convertHtmlToDocxBlocks,
  findSectionRange,
  normalizeHeading,
  parseDocxSource,
  readDocxDocument,
  renderDocxBlocksToMarkdown,
} from "../../documents/docx/index.js";
import type { DocxBlock } from "../../documents/docx/index.js";
import { ensureParentDirectory, fileExists, resolveUserPath, truncateText } from "../../utils/fs.js";
import { recordToolChange } from "../changeTracking.js";
import {
  readDocxSourceFormat,
  readHeadingLevel,
  readTemplateVariables,
  replaceExtension,
} from "../docxShared.js";
import { ToolExecutionError } from "../errors.js";
import { findPathSuggestions } from "../pathSuggestions.js";
import { buildDiffPreview, okResult, parseArgs, readBoolean, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

type EditDocxAction =
  | "replace_document"
  | "append_document"
  | "replace_section"
  | "append_to_section"
  | "add_section";

export const editDocxTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "edit_docx",
      description:
        "Edit an existing .docx file by replacing the whole document, appending content, or targeting a section by heading.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Target .docx file path.",
          },
          action: {
            type: "string",
            description:
              "Edit mode: replace_document, append_document, replace_section, append_to_section, or add_section.",
            enum: ["replace_document", "append_document", "replace_section", "append_to_section", "add_section"],
          },
          content: {
            type: "string",
            description: "Content to write into the document or section body.",
          },
          format: {
            type: "string",
            description: "Content format: plain_text or markdown.",
            enum: ["plain_text", "markdown"],
          },
          heading: {
            type: "string",
            description: "Target section heading for section-based actions.",
          },
          heading_level: {
            type: "number",
            description: "Heading level to use when creating a new section. Range: 1-6.",
          },
          title: {
            type: "string",
            description: "Optional document title metadata override.",
          },
          description: {
            type: "string",
            description: "Optional document description metadata override.",
          },
          variables: {
            type: "object",
            description: "Optional template variables used to replace placeholders like {{name}}.",
            additionalProperties: true,
          },
          create_if_missing: {
            type: "boolean",
            description: "When a section is missing, create it automatically instead of failing.",
          },
          create_directories: {
            type: "boolean",
            description: "Whether to create parent directories automatically.",
          },
        },
        required: ["path", "action", "content"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const targetPath = readString(args.path, "path");
    const action = readEditAction(args.action);
    const content = readString(args.content, "content");
    const format = readDocxSourceFormat(args.format);
    const heading = typeof args.heading === "string" ? args.heading.trim() : undefined;
    const headingLevel = readHeadingLevel(args.heading_level, 2);
    const titleTemplate = typeof args.title === "string" ? args.title.trim() : undefined;
    const descriptionTemplate = typeof args.description === "string" ? args.description.trim() : undefined;
    const variables = readTemplateVariables(args.variables);
    const createIfMissing = readBoolean(args.create_if_missing, false);
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
      throw new ToolExecutionError(`edit_docx requires a .docx path, got: ${extension || "unknown"}`, {
        code: "INVALID_DOCX_OUTPUT_PATH",
        details: {
          requestedPath: targetPath,
          suggestedPath: resolved.endsWith(".") ? `${resolved}docx` : `${resolved}.docx`,
        },
      });
    }

    const existed = await fileExists(resolved);
    const beforeBuffer = existed ? await fs.readFile(resolved) : undefined;

    if (!existed && isSectionAction(action) && !createIfMissing) {
      const suggestions = await findPathSuggestions(context.cwd, targetPath, context.projectContext);
      throw new ToolExecutionError(`File not found: ${targetPath}`, {
        code: "ENOENT",
        details: {
          requestedPath: targetPath,
          suggestions,
        },
      });
    }

    const renderedContent = applyTemplateVariables(content, variables);
    const renderedTitle = titleTemplate ? applyTemplateVariables(titleTemplate, variables) : undefined;
    const renderedDescription = descriptionTemplate
      ? applyTemplateVariables(descriptionTemplate, variables)
      : undefined;

    const existingDocument = existed ? await readDocxDocument(resolved) : undefined;
    const existingBlocksFromHtml = existingDocument ? convertHtmlToDocxBlocks(existingDocument.html) : [];
    const existingBlocks =
      existingBlocksFromHtml.length > 0
        ? existingBlocksFromHtml
        : parseDocxSource(existingDocument?.rawText ?? "", "plain_text");
    const inputBlocks = parseDocxSource(renderedContent.content, format);
    const finalBlocks = applyEditAction(existingBlocks, inputBlocks, {
      action,
      heading,
      headingLevel,
      createIfMissing,
    });
    const finalMarkdown = renderDocxBlocksToMarkdown(finalBlocks);
    const beforeText = existingDocument?.markdownPreview ?? existingDocument?.rawText ?? "";
    const preview = buildDiffPreview(beforeText, finalMarkdown);
    const buffer = await buildDocxBuffer({
      title: renderedTitle?.content ?? existingDocument?.title,
      description: renderedDescription?.content,
      creator: "Deadmouse",
      format: "markdown",
      content: finalMarkdown,
    });

    if (createDirectories) {
      await ensureParentDirectory(resolved);
    }

    await fs.writeFile(resolved, buffer);
    const changeRecord = await recordToolChange(context, {
      toolName: "edit_docx",
      summary: `edit_docx ${resolved} (${action})`,
      preview: truncateText(preview || finalMarkdown, 6_000),
      operations: [
        {
          path: resolved,
          kind: existed ? "update" : "create",
          binary: true,
          preview: truncateText(preview || finalMarkdown, 6_000),
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
          action,
          heading,
          headingLevel,
          variablesApplied: renderedContent.usedKeys,
          missingVariables: [
            ...new Set([
              ...renderedContent.missingKeys,
              ...(renderedTitle?.missingKeys ?? []),
              ...(renderedDescription?.missingKeys ?? []),
            ]),
          ],
          bytes: buffer.length,
          changeId: changeRecord.change?.id,
          changeHistoryWarning: changeRecord.warning,
          preview: truncateText(preview || finalMarkdown, 6_000),
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

function readEditAction(value: unknown): EditDocxAction {
  if (
    value === "replace_document" ||
    value === "append_document" ||
    value === "replace_section" ||
    value === "append_to_section" ||
    value === "add_section"
  ) {
    return value;
  }

  throw new Error(
    'Tool argument "action" must be one of: replace_document, append_document, replace_section, append_to_section, add_section.',
  );
}

function isSectionAction(action: EditDocxAction): boolean {
  return action === "replace_section" || action === "append_to_section";
}

function applyEditAction(
  existingBlocks: DocxBlock[],
  inputBlocks: DocxBlock[],
  options: {
    action: EditDocxAction;
    heading?: string;
    headingLevel: number;
    createIfMissing: boolean;
  },
): DocxBlock[] {
  switch (options.action) {
    case "replace_document":
      return inputBlocks;
    case "append_document":
      return [...existingBlocks, ...inputBlocks];
    case "add_section": {
      const heading = resolveSectionHeading(options.heading, inputBlocks);
      const body = stripLeadingHeading(inputBlocks, heading);
      return [...existingBlocks, createHeadingBlock(heading, options.headingLevel), ...body];
    }
    case "replace_section": {
      const heading = requireHeading(options.heading, options.action);
      const range = findSectionRange(existingBlocks, heading);
      const body = stripLeadingHeading(inputBlocks, heading);

      if (!range) {
        if (!options.createIfMissing) {
          throw new ToolExecutionError(`Section not found: ${heading}`, {
            code: "DOCX_SECTION_NOT_FOUND",
            details: {
              heading,
              availableHeadings: listSectionHeadings(existingBlocks),
            },
          });
        }

        return [...existingBlocks, createHeadingBlock(heading, options.headingLevel), ...body];
      }

      return [
        ...existingBlocks.slice(0, range.headingIndex + 1),
        ...body,
        ...existingBlocks.slice(range.endIndex),
      ];
    }
    case "append_to_section": {
      const heading = requireHeading(options.heading, options.action);
      const range = findSectionRange(existingBlocks, heading);
      const body = stripLeadingHeading(inputBlocks, heading);

      if (!range) {
        if (!options.createIfMissing) {
          throw new ToolExecutionError(`Section not found: ${heading}`, {
            code: "DOCX_SECTION_NOT_FOUND",
            details: {
              heading,
              availableHeadings: listSectionHeadings(existingBlocks),
            },
          });
        }

        return [...existingBlocks, createHeadingBlock(heading, options.headingLevel), ...body];
      }

      return [
        ...existingBlocks.slice(0, range.endIndex),
        ...body,
        ...existingBlocks.slice(range.endIndex),
      ];
    }
  }
}

function requireHeading(value: string | undefined, action: EditDocxAction): string {
  if (!value) {
    throw new Error(`Tool argument "heading" is required when action is "${action}".`);
  }

  return value;
}

function resolveSectionHeading(heading: string | undefined, inputBlocks: DocxBlock[]): string {
  if (heading) {
    return heading;
  }

  const firstHeading = inputBlocks.find(
    (block): block is Extract<DocxBlock, { kind: "paragraph" }> =>
      block.kind === "paragraph" && Boolean(block.headingLevel) && block.text.trim().length > 0,
  );

  if (firstHeading) {
    return firstHeading.text;
  }

  throw new Error('Tool argument "heading" is required when action is "add_section" unless the content starts with a heading.');
}

function stripLeadingHeading(blocks: DocxBlock[], heading: string): DocxBlock[] {
  if (blocks.length === 0) {
    return blocks;
  }

  const [first, ...rest] = blocks;
  if (
    first?.kind === "paragraph" &&
    first.headingLevel &&
    normalizeHeading(first.text) === normalizeHeading(heading)
  ) {
    return rest;
  }

  return blocks;
}

function createHeadingBlock(text: string, headingLevel: number): DocxBlock {
  return {
    kind: "paragraph",
    text,
    headingLevel,
  };
}

function listSectionHeadings(blocks: DocxBlock[]): string[] {
  return blocks
    .filter(
      (block): block is Extract<DocxBlock, { kind: "paragraph" }> =>
        block.kind === "paragraph" && Boolean(block.headingLevel) && block.text.trim().length > 0,
    )
    .map((block) => block.text)
    .slice(0, 50);
}
