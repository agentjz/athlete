import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { getProjectStatePaths } from "../../project/statePaths.js";

export interface ShellOutputCapture {
  outputPreview: string;
  outputPath?: string;
  truncated: boolean;
  outputChars: number;
  outputBytes: number;
}

export interface ShellOutputCaptureAppender {
  append(chunk: string): void;
  finalize(): Promise<ShellOutputCapture>;
}

const DEFAULT_SHELL_OUTPUT_PREVIEW_CHARS = 12_000;

export async function createShellOutputCapture(input: {
  stateRootDir?: string;
  sessionId?: string;
  maxPreviewChars?: number;
}): Promise<ShellOutputCaptureAppender> {
  const maxPreviewChars =
    typeof input.maxPreviewChars === "number" && Number.isFinite(input.maxPreviewChars) && input.maxPreviewChars > 0
      ? Math.trunc(input.maxPreviewChars)
      : DEFAULT_SHELL_OUTPUT_PREVIEW_CHARS;
  const absoluteOutputPath =
    input.stateRootDir && input.sessionId
      ? await createAbsoluteOutputPath(input.stateRootDir, input.sessionId)
      : undefined;
  const outputPath =
    absoluteOutputPath && input.stateRootDir
      ? path.relative(input.stateRootDir, absoluteOutputPath) || undefined
      : undefined;

  let preview = "";
  let bufferedOutput = "";
  let totalChars = 0;
  let totalBytes = 0;
  let truncated = false;
  let pendingWrite = Promise.resolve();

  function append(chunk: string): void {
    if (!chunk) {
      return;
    }

    totalChars += chunk.length;
    totalBytes += Buffer.byteLength(chunk, "utf8");

    if (!truncated) {
      const combined = bufferedOutput + chunk;
      if (combined.length <= maxPreviewChars) {
        bufferedOutput = combined;
        preview = combined;
        return;
      }

      truncated = true;
      preview = combined.slice(0, maxPreviewChars);
      queueWrite(combined);
      bufferedOutput = "";
      return;
    }

    queueWrite(chunk);
  }

  async function finalize(): Promise<ShellOutputCapture> {
    await pendingWrite;
    return {
      outputPreview: truncated ? `${preview}\n\n... [truncated ${totalChars - maxPreviewChars} chars]` : preview,
      outputPath: truncated ? outputPath : undefined,
      truncated,
      outputChars: totalChars,
      outputBytes: totalBytes,
    };
  }

  function queueWrite(chunk: string): void {
    if (!absoluteOutputPath) {
      return;
    }

    pendingWrite = pendingWrite.then(() => fs.appendFile(absoluteOutputPath, chunk, "utf8"));
  }

  return {
    append,
    finalize,
  };
}

async function createAbsoluteOutputPath(stateRootDir: string, sessionId: string): Promise<string> {
  const paths = getProjectStatePaths(stateRootDir);
  const sessionDir = path.join(paths.toolResultsDir, sessionId);
  await fs.mkdir(sessionDir, { recursive: true });
  return path.join(sessionDir, `${Date.now()}-run-shell-${crypto.randomUUID().slice(0, 8)}.txt`);
}
