import fs from "node:fs/promises";
import path from "node:path";

import { MineruClient } from "../../integrations/mineru/client.js";
import { extractMarkdownFromMineruArchive, persistMineruArchive } from "../../integrations/mineru/archive.js";
import { assertPathAllowed, ensureParentDirectory, truncateText } from "../../utils/fs.js";
import { ToolExecutionError } from "../errors.js";
import { findPathSuggestions } from "../pathSuggestions.js";
import { okResult, parseArgs, readBoolean, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const readPdfTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "read_pdf",
      description: "Read a PDF through the MinerU standard API and return a Markdown preview plus artifact paths.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Local PDF path.",
          },
          ocr: {
            type: "boolean",
            description: "Whether to force OCR-oriented parsing. Defaults to true.",
          },
          language: {
            type: "string",
            description: "Optional MinerU language override.",
          },
          model_version: {
            type: "string",
            description: "Optional MinerU model version override.",
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

    if (!context.config.mineru.token) {
      throw new ToolExecutionError("Missing MINERU_API_TOKEN in .athlete/.env.", {
        code: "MINERU_TOKEN_MISSING",
      });
    }

    if (extension !== ".pdf") {
      throw new ToolExecutionError(`read_pdf requires a .pdf path, got: ${extension || "unknown"}`, {
        code: "UNSUPPORTED_PDF_FORMAT",
        details: {
          requestedPath: targetPath,
          supportedExtensions: [".pdf"],
        },
      });
    }

    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(resolved);
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

    const client = new MineruClient({
      ...context.config.mineru,
      language:
        typeof args.language === "string" && args.language.trim().length > 0
          ? args.language.trim()
          : context.config.mineru.language,
      modelVersion:
        typeof args.model_version === "string" && args.model_version.trim().length > 0
          ? args.model_version.trim()
          : context.config.mineru.modelVersion,
    });
    const isOcr = readBoolean(args.ocr, true);
    const batch = await client.createUploadBatch({
      fileName: path.basename(resolved),
      isOcr,
      language: typeof args.language === "string" ? args.language.trim() : undefined,
      modelVersion: typeof args.model_version === "string" ? args.model_version.trim() : undefined,
    });
    const uploadUrl = batch.fileUrls[0];
    if (!uploadUrl) {
      throw new ToolExecutionError(`MinerU did not return an upload URL for ${targetPath}.`, {
        code: "MINERU_UPLOAD_URL_MISSING",
      });
    }

    await client.uploadFile(uploadUrl, resolved);
    const result = await client.waitForBatchResult({
      batchId: batch.batchId,
      fileName: path.basename(resolved),
    });

    const artifactDir = path.join(context.projectContext.stateRootDir, ".athlete", "mineru", batch.batchId);
    const archivePath = path.join(artifactDir, "result.zip");
    const extractDir = path.join(artifactDir, "extract");
    const markdownPath = path.join(artifactDir, "full.md");
    let markdown = "";

    if (result.fullZipUrl) {
      const archiveBuffer = await client.downloadBuffer(result.fullZipUrl);
      await ensureParentDirectory(archivePath);
      await persistMineruArchive({
        archiveBuffer,
        archivePath,
        extractDir,
      });
      const extracted = await extractMarkdownFromMineruArchive(archivePath);
      markdown = extracted.markdown;
      await fs.writeFile(markdownPath, markdown, "utf8");
    } else if (result.fullMarkdownUrl) {
      markdown = (await client.downloadBuffer(result.fullMarkdownUrl)).toString("utf8");
      await ensureParentDirectory(markdownPath);
      await fs.writeFile(markdownPath, markdown, "utf8");
    } else {
      throw new ToolExecutionError(`MinerU completed without returning a markdown artifact for ${targetPath}.`, {
        code: "MINERU_RESULT_MISSING",
      });
    }

    return okResult(
      JSON.stringify(
        {
          path: resolved,
          readable: true,
          format: "pdf",
          provider: "mineru",
          size: stat.size,
          batchId: batch.batchId,
          state: result.state,
          totalPages: result.totalPages,
          extractedPages: result.extractedPages,
          artifactDir,
          archivePath: result.fullZipUrl ? archivePath : undefined,
          markdownPath,
          markdownPreview: truncateText(markdown, Math.max(2_000, Math.floor(context.config.maxReadBytes / 2))),
          markdownPreviewTruncated: markdown.length > Math.max(2_000, Math.floor(context.config.maxReadBytes / 2)),
        },
        null,
        2,
      ),
    );
  },
};
