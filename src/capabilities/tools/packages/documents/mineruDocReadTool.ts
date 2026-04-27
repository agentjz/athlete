import path from "node:path";

import { getMineruSupportedExtensions } from "../../../../integrations/mineru/constants.js";
import { okResult } from "../../core/shared.js";
import type { RegisteredTool } from "../../core/types.js";
import { ToolExecutionError } from "../../core/errors.js";
import { readDocxTool } from "./readDocxTool.js";
import { executePreparedMineruRead, prepareMineruReadRequest } from "./mineruExecution.js";

const SUPPORTED_EXTENSIONS = getMineruSupportedExtensions("doc");
const DOCX_FALLBACK_CODES = new Set([
  "MINERU_TOKEN_MISSING",
  "MINERU_REQUEST_FAILED",
  "MINERU_UPLOAD_URL_MISSING",
  "MINERU_RESULT_MISSING",
]);

export const mineruDocReadTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "mineru_doc_read",
      description:
        "Read a .doc or .docx document through MinerU and return a Markdown preview plus artifact paths. For .docx, read_docx is the fallback path when MinerU is unavailable.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Local .doc or .docx path.",
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
    const request = await prepareMineruReadRequest(rawArgs, context, {
      toolName: "mineru_doc_read",
      category: "doc",
      supportedExtensions: SUPPORTED_EXTENSIONS,
      format: (extension) => extension.replace(/^\./, ""),
    });

    if (request.extension === ".docx" && !context.config.mineru.token) {
      return executeNativeDocxFallback(rawArgs, context, {
        trigger: "MINERU_TOKEN_MISSING",
        reason: "Missing MINERU_API_TOKEN in .deadmouse/.env.",
      });
    }

    try {
      return await executePreparedMineruRead(request, context, {
        toolName: "mineru_doc_read",
        category: "doc",
        supportedExtensions: SUPPORTED_EXTENSIONS,
        format: (extension) => extension.replace(/^\./, ""),
      });
    } catch (error) {
      const fallback = getDocxFallback(error, request.extension);
      if (!fallback) {
        throw error;
      }

      return executeNativeDocxFallback(rawArgs, context, fallback);
    }
  },
};

function getDocxFallback(
  error: unknown,
  extension: string,
): { trigger: string; reason: string } | null {
  if (extension !== ".docx" || !(error instanceof ToolExecutionError) || !DOCX_FALLBACK_CODES.has(error.code)) {
    return null;
  }

  return {
    trigger: error.code,
    reason: error.message,
  };
}

async function executeNativeDocxFallback(
  rawArgs: string,
  context: Parameters<RegisteredTool["execute"]>[1],
  fallback: {
    trigger: string;
    reason: string;
  },
) {
  const nativeResult = await readDocxTool.execute(rawArgs, context);
  const parsed = JSON.parse(nativeResult.output) as Record<string, unknown>;

  return okResult(
    JSON.stringify(
      {
        ...parsed,
        format: parsed.format ?? (path.extname(String(parsed.path ?? "")).replace(/^\./, "") || "docx"),
        provider: "native_docx_fallback",
        fallback: {
          used: true,
          trigger: fallback.trigger,
          reason: fallback.reason,
        },
      },
      null,
      2,
    ),
    nativeResult.metadata,
  );
}
