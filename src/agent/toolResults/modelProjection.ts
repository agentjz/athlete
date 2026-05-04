import { truncateText } from "../../utils/fs.js";
import type { ToolExecutionResult } from "../../types.js";

const DEFAULT_MAX_CHARS = 4_000;
const DIFF_MAX_CHARS = 3_000;
const OUTPUT_MAX_CHARS = 1_500;

export function projectToolResultForModel(input: {
  toolName: string;
  result: ToolExecutionResult;
}): string {
  const parsed = parseObject(input.result.output);
  if (!input.result.ok) {
    return projectFailure(input.toolName, input.result.output, parsed);
  }

  if (!parsed) {
    return truncateText(input.result.output.trim(), DEFAULT_MAX_CHARS);
  }

  switch (input.toolName) {
    case "read":
      return projectRead(parsed);
    case "edit":
      return projectEdit(parsed);
    case "write":
      return projectWrite(parsed);
    case "bash":
      return projectBash(parsed);
    default:
      return projectGenericSuccess(parsed, input.result.output);
  }
}

function projectRead(payload: Record<string, unknown>): string {
  const path = readString(payload.path) ?? readString(payload.requestedPath) ?? "file";
  if (payload.readable === false) {
    return joinLines([
      `${path}: not readable`,
      readString(payload.reason),
      readString(payload.detectedCapability) ? `capability: ${readString(payload.detectedCapability)}` : undefined,
    ]);
  }

  const startLine = readNumber(payload.startLine);
  const endLine = readNumber(payload.endLine);
  const content = readString(payload.content) ?? "";
  const continuation = readObject(payload.continuation);
  const continuationArgs = readObject(continuation?.continuationArgs);

  return joinLines([
    `${path}${startLine && endLine ? `:${startLine}-${endLine}` : ""}`,
    truncateText(content, DEFAULT_MAX_CHARS),
    continuationArgs ? `next: read ${JSON.stringify(continuationArgs)}` : undefined,
  ]);
}

function projectEdit(payload: Record<string, unknown>): string {
  const path = readString(payload.path) ?? "file";
  const applied = readNumber(payload.appliedEdits) ?? readNumber(payload.requestedEdits);
  const diff = readString(payload.diff) ?? readString(payload.preview);
  return joinLines([
    `edited ${path}${applied ? ` (${applied} replacement${applied === 1 ? "" : "s"})` : ""}`,
    diff ? truncateText(diff, DIFF_MAX_CHARS) : undefined,
  ]);
}

function projectWrite(payload: Record<string, unknown>): string {
  const path = readString(payload.path) ?? "file";
  const bytes = readNumber(payload.bytes);
  const existed = payload.existed === true;
  const diff = readString(payload.diff) ?? readString(payload.preview);
  return joinLines([
    `${existed ? "wrote" : "created"} ${path}${bytes !== undefined ? ` (${bytes} bytes)` : ""}`,
    diff ? truncateText(diff, DIFF_MAX_CHARS) : undefined,
  ]);
}

function projectBash(payload: Record<string, unknown>): string {
  const exitCode = readNumber(payload.exitCode);
  const durationMs = readNumber(payload.durationMs);
  const status = readString(payload.status);
  const output = readString(payload.output);
  const lines = [
    `exit ${exitCode ?? "?"}${durationMs !== undefined ? ` in ${durationMs}ms` : ""}${status && status !== "completed" ? ` (${status})` : ""}`,
  ];
  if (output?.trim()) {
    lines.push(truncateText(output.trim(), OUTPUT_MAX_CHARS));
  }
  if (payload.truncated === true) {
    lines.push("output truncated");
  }
  return joinLines(lines);
}

function projectGenericSuccess(payload: Record<string, unknown>, rawOutput: string): string {
  const lines = [
    readString(payload.summary),
    readString(payload.preview),
    readString(payload.output),
    readString(payload.content),
  ].filter((line): line is string => Boolean(line));

  if (lines.length > 0) {
    return truncateText(lines.join("\n"), DEFAULT_MAX_CHARS);
  }

  const fragments = [
    formatScalar("path", payload.path),
    formatScalar("title", payload.title),
    formatArrayCount("matches", payload.matches),
    formatScalar("total", payload.total),
    formatScalar("jobId", payload.jobId),
    formatScalar("taskId", payload.taskId),
    formatScalar("status", payload.status ?? payload.jobStatus),
  ].filter((fragment): fragment is string => Boolean(fragment));

  return fragments.length > 0
    ? truncateText(fragments.join("; "), DEFAULT_MAX_CHARS)
    : truncateText(rawOutput.trim(), DEFAULT_MAX_CHARS);
}

function projectFailure(toolName: string, rawOutput: string, payload: Record<string, unknown> | null): string {
  if (!payload) {
    return truncateText(rawOutput.trim(), DEFAULT_MAX_CHARS);
  }

  const details = readObject(payload.details);
  const readArgs = readObject(details?.readArgs);
  const suggestions = readArray(details?.suggestions);
  const lines = [
    `${toolName} failed: ${readString(payload.error) ?? "unknown error"}`,
    readString(payload.code) ? `code: ${readString(payload.code)}` : undefined,
    readString(payload.hint) ? `hint: ${readString(payload.hint)}` : undefined,
    readArgs ? `read: read ${JSON.stringify(readArgs)}` : undefined,
    suggestions && suggestions.length > 0 ? `suggestions: ${suggestions.slice(0, 5).map((item) => String(item)).join(", ")}` : undefined,
  ];

  return truncateText(joinLines(lines), DEFAULT_MAX_CHARS);
}

function joinLines(lines: Array<string | undefined>): string {
  return lines
    .map((line) => line?.trimEnd())
    .filter((line): line is string => Boolean(line && line.length > 0))
    .join("\n");
}

function parseObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined;
}

function formatScalar(key: string, value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return `${key}: ${String(value)}`;
  }
  return undefined;
}

function formatArrayCount(key: string, value: unknown): string | undefined {
  return Array.isArray(value) ? `${key}: ${value.length}` : undefined;
}
