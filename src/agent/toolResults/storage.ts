import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { createToolMessage } from "../session/messages.js";
import { buildToolPayloadPreview, compactToolPayload } from "./preview.js";
import { getProjectStatePaths } from "../../project/statePaths.js";
import type { ExternalizedToolResultReference, ProjectContext, StoredMessage } from "../../types.js";

const LARGE_TOOL_RESULT_CHAR_THRESHOLD = 12_000;
const LARGE_TOOL_RESULT_BYTE_THRESHOLD = 16_000;
const TOOL_RESULT_PREVIEW_MAX_CHARS = 1_600;

interface CreateStoredToolMessageParams {
  toolCallId: string;
  toolName: string;
  rawOutput: string;
  sessionId: string;
  projectContext: Pick<ProjectContext, "stateRootDir">;
}

export async function createStoredToolMessage(
  params: CreateStoredToolMessageParams,
): Promise<StoredMessage> {
  if (!shouldExternalizeToolResult(params.rawOutput)) {
    return createToolMessage(params.toolCallId, params.rawOutput, params.toolName);
  }

  const externalizedToolResult = await externalizeToolResult(params);
  return createToolMessage(
    params.toolCallId,
    JSON.stringify(buildExternalizedToolPayload(params.toolName, params.rawOutput, externalizedToolResult), null, 2),
    params.toolName,
    {
      externalizedToolResult,
    },
  );
}

export function shouldExternalizeToolResult(rawOutput: string): boolean {
  return (
    rawOutput.length > LARGE_TOOL_RESULT_CHAR_THRESHOLD ||
    Buffer.byteLength(rawOutput, "utf8") > LARGE_TOOL_RESULT_BYTE_THRESHOLD
  );
}

async function externalizeToolResult(
  params: CreateStoredToolMessageParams,
): Promise<ExternalizedToolResultReference> {
  const statePaths = getProjectStatePaths(params.projectContext.stateRootDir);
  const sessionDir = path.join(statePaths.toolResultsDir, params.sessionId);
  const extension = detectStorageExtension(params.rawOutput);
  const slug = slugify(params.toolName);
  const hash = crypto.createHash("sha256").update(params.rawOutput).digest("hex");
  const filename = `${Date.now()}-${slug}-${hash.slice(0, 12)}.${extension}`;
  const absoluteStoragePath = path.join(sessionDir, filename);
  const storagePath = path.relative(params.projectContext.stateRootDir, absoluteStoragePath) || filename;

  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(absoluteStoragePath, params.rawOutput, "utf8");

  return {
    scope: "project_state_root",
    storagePath,
    byteLength: Buffer.byteLength(params.rawOutput, "utf8"),
    charLength: params.rawOutput.length,
    preview: buildToolPayloadPreview(params.rawOutput, TOOL_RESULT_PREVIEW_MAX_CHARS),
    sha256: hash,
  };
}

function buildExternalizedToolPayload(
  toolName: string,
  rawOutput: string,
  externalizedToolResult: ExternalizedToolResultReference,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    externalized: true,
    tool: toolName,
    storagePath: externalizedToolResult.storagePath,
    byteLength: externalizedToolResult.byteLength,
    charLength: externalizedToolResult.charLength,
    summary: buildExternalizedSummary(toolName, rawOutput),
    preview: externalizedToolResult.preview,
    sha256: externalizedToolResult.sha256,
  };

  try {
    const parsed = JSON.parse(rawOutput) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      copyScalarField(payload, parsed, "ok");
      copyScalarField(payload, parsed, "path");
      copyScalarField(payload, parsed, "requestedPath");
      copyScalarField(payload, parsed, "format");
      copyScalarField(payload, parsed, "title");
      copyCountField(payload, parsed, "entries");
      copyCountField(payload, parsed, "matches");
      copyCountField(payload, parsed, "sheets");
      copyScalarField(payload, parsed, "searched");
      copyScalarField(payload, parsed, "total");
      copyScalarField(payload, parsed, "jobId");
      copyScalarField(payload, parsed, "jobStatus");
      copyScalarField(payload, parsed, "taskId");
      copyScalarField(payload, parsed, "task");
      copyScalarField(payload, parsed, "member");
      copyScalarField(payload, parsed, "worktree");
    }
  } catch {
    // keep generic payload
  }

  return payload;
}

function buildExternalizedSummary(toolName: string, rawOutput: string): string {
  try {
    const parsed = JSON.parse(rawOutput) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const fragments = [
        describeScalar("ok", parsed.ok),
        describeScalar("path", parsed.path),
        describeScalar("requestedPath", parsed.requestedPath),
        describeScalar("format", parsed.format),
        describeScalar("title", parsed.title),
        describeArrayCount("entries", parsed.entries),
        describeArrayCount("matches", parsed.matches),
        describeArrayCount("sheets", parsed.sheets),
        describeScalar("searched", parsed.searched),
        describeScalar("total", parsed.total),
        describeScalar("jobId", parsed.jobId),
        describeScalar("jobStatus", parsed.jobStatus),
        describeScalar("taskId", parsed.taskId),
        describeScalar("task", parsed.task),
        describeScalar("member", parsed.member),
        describeScalar("worktree", parsed.worktree),
      ].filter((fragment): fragment is string => Boolean(fragment));

      if (fragments.length > 0) {
        return fragments.join("; ");
      }
    }
  } catch {
    // fall through
  }

  return compactToolPayload(toolName, rawOutput, 320);
}

function detectStorageExtension(rawOutput: string): string {
  try {
    JSON.parse(rawOutput);
    return "json";
  } catch {
    return "txt";
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "tool-result";
}

function copyScalarField(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  key: string,
): void {
  const value = source[key];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    target[key] = value;
  }
}

function copyCountField(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  key: string,
): void {
  const value = source[key];
  if (!Array.isArray(value)) {
    return;
  }

  target[`${key}Count`] = value.length;
}

function describeScalar(key: string, value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return `${key}=${String(value)}`;
  }

  return undefined;
}

function describeArrayCount(key: string, value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return `${key}=${value.length}`;
}
