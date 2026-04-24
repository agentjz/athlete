import { ui } from "../../utils/console.js";

export type TerminalVerbosity = "minimal" | "normal" | "verbose";

const VISIBLE_PREVIEW_MAX_LINES = 3;
const VISIBLE_PREVIEW_MAX_CHARS = 1_600;
const READ_CONTENT_PREVIEW_TOOL_NAMES = new Set([
  "read_file",
  "read_docx",
  "read_spreadsheet",
  "mineru_doc_read",
  "mineru_image_read",
  "mineru_pdf_read",
  "mineru_ppt_read",
]);
const HIGH_NOISE_PREVIEW_TOOL_NAMES = new Set(["edit_file", "apply_patch"]);
const MINIMAL_VERBOSE_PREVIEW_TOOL_NAMES = new Set([
  ...READ_CONTENT_PREVIEW_TOOL_NAMES,
  "todo_write",
]);

export function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...`;
}

export function truncateBlock(value: string, maxChars: number): string {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars)}\n... [truncated]`;
}

export function truncateVisiblePreview(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return normalized;
  }

  const lines = normalized.split("\n");
  const limitedLines = lines.slice(0, VISIBLE_PREVIEW_MAX_LINES);
  const linesTruncated = lines.length > VISIBLE_PREVIEW_MAX_LINES;
  let preview = limitedLines.join("\n");
  let truncated = linesTruncated;

  if (preview.length > VISIBLE_PREVIEW_MAX_CHARS) {
    preview = preview.slice(0, VISIBLE_PREVIEW_MAX_CHARS);
    truncated = true;
  }

  if (!truncated) {
    return preview;
  }

  return appendTruncatedMarker(preview);
}

export function compactHighNoisePreview(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return normalized;
  }

  const lines = normalized.split("\n");
  const headLines = lines.slice(0, 8).join("\n");
  const moreLines = Math.max(0, lines.length - 8);
  const compactedHead = truncateBlock(headLines, 1_200);
  return moreLines > 0
    ? `${compactedHead}\n... (${moreLines} more line(s))`
    : compactedHead;
}

export function summarizePatchPreview(value: string): string {
  return compactHighNoisePreview(value);
}

export function shouldClampReadContentPreview(name: string): boolean {
  return READ_CONTENT_PREVIEW_TOOL_NAMES.has(name);
}

export function shouldShowToolCallPreview(name: string, verbosity: TerminalVerbosity): boolean {
  if (name === "todo_write") {
    return false;
  }

  return verbosity !== "minimal";
}

export function shouldShowToolResultPreview(name: string, verbosity: TerminalVerbosity): boolean {
  if (verbosity === "minimal") {
    return MINIMAL_VERBOSE_PREVIEW_TOOL_NAMES.has(name);
  }

  return true;
}

export function shouldCompactPreview(name: string): boolean {
  return HIGH_NOISE_PREVIEW_TOOL_NAMES.has(name);
}

export function normalizeTerminalVerbosity(
  value: TerminalVerbosity | undefined,
): TerminalVerbosity {
  switch (value) {
    case "minimal":
    case "normal":
    case "verbose":
      return value;
    default:
      return "normal";
  }
}

export function emitPreview(
  label: "content" | "preview",
  preview: string,
  verbosity: TerminalVerbosity,
): void {
  if (verbosity === "minimal") {
    ui.dim(preview);
    return;
  }

  ui.dim(`[${label}]\n${preview}`);
}

function appendTruncatedMarker(preview: string): string {
  const marker = "... [truncated]";
  const lines = preview.split("\n");
  if (lines.length < VISIBLE_PREVIEW_MAX_LINES) {
    return `${preview}\n${marker}`;
  }

  const head = lines.slice(0, Math.max(0, VISIBLE_PREVIEW_MAX_LINES - 1));
  const tail = lines.at(VISIBLE_PREVIEW_MAX_LINES - 1) ?? "";
  return [...head, `${tail} ${marker}`.trim()].join("\n");
}
