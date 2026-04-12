import fs from "node:fs/promises";
import path from "node:path";

import { ensureParentDirectory, resolveUserPath } from "../../utils/fs.js";
import { ToolExecutionError } from "../errors.js";
import { clampNumber, okResult, parseArgs, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const downloadUrlTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "download_url",
      description: "Download a public URL onto the local filesystem. Use this to acquire remote documents before reading them with local tools.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "HTTP or HTTPS URL to download.",
          },
          path: {
            type: "string",
            description: "Destination file path on the local filesystem.",
          },
          timeout_ms: {
            type: "number",
            description: "Optional timeout in milliseconds.",
          },
        },
        required: ["url", "path"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const url = readString(args.url, "url");
    const targetPath = readString(args.path, "path");
    const timeoutMs = clampNumber(args.timeout_ms, 1_000, 300_000, 60_000);

    if (!/^https?:\/\//i.test(url)) {
      throw new ToolExecutionError(`download_url only supports http(s) URLs, got: ${url}`, {
        code: "DOWNLOAD_URL_PROTOCOL_UNSUPPORTED",
      });
    }

    const resolvedPath = resolveUserPath(targetPath, context.cwd);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("download_url timed out")), timeoutMs);
    if (context.abortSignal) {
      context.abortSignal.addEventListener("abort", () => controller.abort(context.abortSignal?.reason), { once: true });
    }

    try {
      const response = await fetch(url, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ToolExecutionError(`download_url failed with status ${response.status} for ${url}`, {
          code: "DOWNLOAD_URL_HTTP_ERROR",
          details: {
            status: response.status,
            url,
          },
        });
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      await ensureParentDirectory(resolvedPath);
      await fs.writeFile(resolvedPath, bytes);

      return okResult(
        JSON.stringify(
          {
            ok: true,
            url,
            path: resolvedPath,
            requestedPath: targetPath,
            fileName: path.basename(resolvedPath),
            bytes: bytes.length,
            contentType: response.headers.get("content-type") ?? undefined,
          },
          null,
          2,
        ),
        {
          changedPaths: [targetPath],
        },
      );
    } finally {
      clearTimeout(timer);
    }
  },
};
