import fs from "node:fs/promises";

import { ToolExecutionError } from "../../../../tools/core/errors.js";
import { clampNumber, parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { ensureParentDirectory, resolveUserPath } from "../../../../utils/fs.js";
import { changedJsonResult } from "../../../shared.js";
import { fetchWithTimeout } from "../httpRuntime.js";

export const downloadUrlTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "download_url",
      description: "Download one HTTP(S) URL into a local file.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
          path: { type: "string" },
          timeout_ms: { type: "number" },
        },
        required: ["url", "path"],
        additionalProperties: false,
      },
    },
  },
  changeSignal: "required",
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const url = readString(args.url, "url");
    if (!/^https?:\/\//i.test(url)) {
      throw new ToolExecutionError(`download_url only supports HTTP(S) URLs: ${url}`, {
        code: "DOWNLOAD_URL_UNSUPPORTED_PROTOCOL",
        details: { url },
      });
    }
    const targetPath = resolveUserPath(readString(args.path, "path"), context.cwd);
    const response = await fetchWithTimeout(
      url,
      { method: "GET" },
      clampNumber(args.timeout_ms, 1_000, 300_000, 60_000),
      context.abortSignal,
    );
    if (!response.ok) {
      throw new ToolExecutionError(`download_url failed with status ${response.status}: ${url}`, {
        code: "DOWNLOAD_URL_HTTP_ERROR",
        details: { url, status: response.status },
      });
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    await ensureParentDirectory(targetPath);
    await fs.writeFile(targetPath, bytes);
    return changedJsonResult({
      ok: response.ok,
      url,
      path: targetPath,
      bytes: bytes.length,
      contentType: response.headers.get("content-type") ?? undefined,
    }, [targetPath]);
  },
};
