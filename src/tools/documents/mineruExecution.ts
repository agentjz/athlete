import fs from "node:fs/promises";
import path from "node:path";

import { extractMarkdownFromMineruArchive, persistMineruArchive } from "../../integrations/mineru/archive.js";
import {
  MINERU_MAX_FILE_BYTES,
  MINERU_MAX_FILE_MB,
  MINERU_MAX_PAGES,
  type MineruDocumentCategory,
} from "../../integrations/mineru/constants.js";
import { MineruClient } from "../../integrations/mineru/client.js";
import { probeMineruPageCount } from "../../integrations/mineru/pageCount.js";
import { ensureParentDirectory, resolveUserPath, truncateText } from "../../utils/fs.js";
import { ToolExecutionError } from "../errors.js";
import { findPathSuggestions } from "../pathSuggestions.js";
import { okResult, parseArgs, readBoolean, readString } from "../shared.js";
import type { ToolContext } from "../types.js";

export interface PreparedMineruReadRequest {
  targetPath: string;
  resolvedPath: string;
  extension: string;
  size: number;
  pageCount?: number;
  pageCountSource: string;
  ocr: boolean;
  language?: string;
  modelVersion?: string;
}

export interface MineruReadExecutionOptions {
  toolName: string;
  category: MineruDocumentCategory;
  supportedExtensions: readonly string[];
  format: string | ((extension: string) => string);
}

export async function prepareMineruReadRequest(
  rawArgs: string,
  context: ToolContext,
  options: MineruReadExecutionOptions,
): Promise<PreparedMineruReadRequest> {
  const args = parseArgs(rawArgs);
  const targetPath = readString(args.path, "path");
  const resolvedPath = resolveUserPath(targetPath, context.cwd);
  const extension = path.extname(resolvedPath).toLowerCase();

  if (!options.supportedExtensions.includes(extension)) {
    throw new ToolExecutionError(
      `${options.toolName} requires one of ${options.supportedExtensions.join(", ")} paths, got: ${extension || "unknown"}`,
      {
        code: "UNSUPPORTED_MINERU_FORMAT",
        details: {
          requestedPath: targetPath,
          supportedExtensions: options.supportedExtensions,
        },
      },
    );
  }

  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(resolvedPath);
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

  if (stat.size > MINERU_MAX_FILE_BYTES) {
    throw new ToolExecutionError(
      `${options.toolName} size limit exceeded: current value ${formatMegabytes(stat.size)} MB, limit ${MINERU_MAX_FILE_MB} MB.`,
      {
        code: "MINERU_SIZE_LIMIT_EXCEEDED",
        details: {
          requestedPath: targetPath,
          currentBytes: stat.size,
          maxBytes: MINERU_MAX_FILE_BYTES,
        },
      },
    );
  }

  const pageCountProbe = await probeMineruPageCount(resolvedPath, extension);
  if (pageCountProbe.value && pageCountProbe.value > MINERU_MAX_PAGES) {
    throw new ToolExecutionError(
      `${options.toolName} page limit exceeded: current value ${pageCountProbe.value} pages, limit ${MINERU_MAX_PAGES} pages.`,
      {
        code: "MINERU_PAGE_LIMIT_EXCEEDED",
        details: {
          requestedPath: targetPath,
          currentPages: pageCountProbe.value,
          maxPages: MINERU_MAX_PAGES,
          source: pageCountProbe.source,
        },
      },
    );
  }

  return {
    targetPath,
    resolvedPath,
    extension,
    size: stat.size,
    pageCount: pageCountProbe.value,
    pageCountSource: pageCountProbe.source,
    ocr: readBoolean(args.ocr, true),
    language: typeof args.language === "string" && args.language.trim().length > 0 ? args.language.trim() : undefined,
    modelVersion:
      typeof args.model_version === "string" && args.model_version.trim().length > 0
        ? args.model_version.trim()
        : undefined,
  };
}

export async function executePreparedMineruRead(
  request: PreparedMineruReadRequest,
  context: ToolContext,
  options: MineruReadExecutionOptions,
) {
  if (!context.config.mineru.token) {
    throw new ToolExecutionError("Missing MINERU_API_TOKEN in .deadmouse/.env.", {
      code: "MINERU_TOKEN_MISSING",
    });
  }

  const client = new MineruClient({
    ...context.config.mineru,
    language: request.language ?? context.config.mineru.language,
    modelVersion: request.modelVersion ?? context.config.mineru.modelVersion,
  });

  try {
    const batch = await client.createUploadBatch({
      fileName: path.basename(request.resolvedPath),
      isOcr: request.ocr,
      language: request.language,
      modelVersion: request.modelVersion,
    });
    const uploadUrl = batch.fileUrls[0];
    if (!uploadUrl) {
      throw new ToolExecutionError(`MinerU did not return an upload URL for ${request.targetPath}.`, {
        code: "MINERU_UPLOAD_URL_MISSING",
      });
    }

    await client.uploadFile(uploadUrl, request.resolvedPath);
    const result = await client.waitForBatchResult({
      batchId: batch.batchId,
      fileName: path.basename(request.resolvedPath),
    });
    const totalPages = result.totalPages ?? request.pageCount;
    if (totalPages && totalPages > MINERU_MAX_PAGES) {
      throw new ToolExecutionError(
        `${options.toolName} page limit exceeded: current value ${totalPages} pages, limit ${MINERU_MAX_PAGES} pages.`,
        {
          code: "MINERU_PAGE_LIMIT_EXCEEDED",
          details: {
            requestedPath: request.targetPath,
            currentPages: totalPages,
            maxPages: MINERU_MAX_PAGES,
            source: "mineru_result",
          },
        },
      );
    }

    const artifactDir = path.join(context.projectContext.stateRootDir, ".deadmouse", "mineru", batch.batchId);
    const archivePath = path.join(artifactDir, "result.zip");
    const markdownPath = path.join(artifactDir, "full.md");
    const markdown = await persistMineruMarkdownArtifacts(client, result, {
      targetPath: request.targetPath,
      artifactDir,
      archivePath,
      markdownPath,
    });

    return okResult(
      JSON.stringify(
        {
          path: request.resolvedPath,
          readable: true,
          format: resolveFormat(options.format, request.extension),
          sourceExtension: request.extension,
          provider: "mineru",
          size: request.size,
          pageCount: totalPages,
          pageCountSource: totalPages === result.totalPages ? "mineru_result" : request.pageCountSource,
          batchId: batch.batchId,
          state: result.state,
          totalPages: result.totalPages,
          extractedPages: result.extractedPages,
          artifactDir,
          archivePath: result.fullZipUrl ? archivePath : undefined,
          markdownPath,
          markdownPreview: truncateText(markdown, Math.max(2_000, Math.floor(context.config.maxReadBytes / 2))),
          markdownPreviewTruncated:
            markdown.length > Math.max(2_000, Math.floor(context.config.maxReadBytes / 2)),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (error instanceof ToolExecutionError) {
      throw error;
    }

    throw new ToolExecutionError(
      `MinerU request failed: ${error instanceof Error ? error.message : String(error)}`,
      {
        code: "MINERU_REQUEST_FAILED",
        details: {
          requestedPath: request.targetPath,
        },
      },
    );
  }
}

async function persistMineruMarkdownArtifacts(
  client: MineruClient,
  result: Awaited<ReturnType<MineruClient["waitForBatchResult"]>>,
  options: {
    targetPath: string;
    artifactDir: string;
    archivePath: string;
    markdownPath: string;
  },
): Promise<string> {
  if (result.fullZipUrl) {
    const archiveBuffer = await client.downloadBuffer(result.fullZipUrl);
    await ensureParentDirectory(options.archivePath);
    await persistMineruArchive({
      archiveBuffer,
      archivePath: options.archivePath,
      extractDir: path.join(options.artifactDir, "extract"),
    });
    const extracted = await extractMarkdownFromMineruArchive(options.archivePath);
    await fs.writeFile(options.markdownPath, extracted.markdown, "utf8");
    return extracted.markdown;
  }

  if (result.fullMarkdownUrl) {
    const markdown = (await client.downloadBuffer(result.fullMarkdownUrl)).toString("utf8");
    await ensureParentDirectory(options.markdownPath);
    await fs.writeFile(options.markdownPath, markdown, "utf8");
    return markdown;
  }

  throw new ToolExecutionError(
    `MinerU completed without returning a markdown artifact for ${options.targetPath}.`,
    {
      code: "MINERU_RESULT_MISSING",
    },
  );
}

function formatMegabytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return Number.isInteger(megabytes) ? String(megabytes) : megabytes.toFixed(1);
}

function resolveFormat(
  format: string | ((extension: string) => string),
  extension: string,
): string {
  return typeof format === "function" ? format(extension) : format;
}
