import path from "node:path";

import { buildToolPayloadPreview, compactToolPayload } from "../../../../agent/context.js";
import { getProjectStatePaths } from "../../../../project/statePaths.js";
import { formatFileWithLineNumbers } from "../../../../utils/fs.js";
import type { InspectedFile } from "../../core/fileIntrospection.js";

const ARTIFACT_PREVIEW_MAX_CHARS = 1_400;

export function isToolResultArtifactPath(filePath: string, stateRootDir: string): boolean {
  const normalizedPath = path.resolve(filePath);
  const artifactRoot = path.resolve(getProjectStatePaths(stateRootDir).toolResultsDir);

  return (
    normalizedPath === artifactRoot ||
    normalizedPath.startsWith(`${artifactRoot}${path.sep}`)
  );
}

export function buildToolResultArtifactReadPayload(
  filePath: string,
  inspected: InspectedFile,
): Record<string, unknown> {
  const rawContent = inspected.content ?? "";
  const summary = buildArtifactSummary(rawContent);
  const preview = buildToolPayloadPreview(rawContent, ARTIFACT_PREVIEW_MAX_CHARS);
  const content = buildArtifactContent(summary, preview);

  return {
    path: filePath,
    readable: true,
    size: inspected.size,
    extension: inspected.extension,
    artifactType: "externalized_tool_result",
    note:
      "This file stores an externalized tool result. Use the summary and preview first, and only reread it with a specific line range when you still need a missing detail.",
    summary,
    preview,
    startLine: 1,
    endLine: content.split(/\r?\n/).length,
    content,
  };
}

function buildArtifactContent(summary: string, preview: string): string {
  const lines = [
    "Externalized tool-result artifact",
    "",
    `Summary: ${summary}`,
    "",
    "Preview:",
    preview,
  ];

  return formatFileWithLineNumbers(lines.join("\n"), 1);
}

function buildArtifactSummary(rawContent: string): string {
  try {
    const parsed = JSON.parse(rawContent) as Record<string, unknown>;
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

  return compactToolPayload(undefined, rawContent, 320);
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
