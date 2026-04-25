import { ui } from "../../utils/console.js";

export type TerminalVerbosity = "minimal" | "normal" | "verbose";

const VISIBLE_RESULT_PREVIEW_MAX_CHARS = 180;

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
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return normalized;
  }

  return truncate(normalized, VISIBLE_RESULT_PREVIEW_MAX_CHARS);
}

export function summarizePatchPreview(value: string): string {
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

export function shouldShowToolCallPreview(name: string, verbosity: TerminalVerbosity): boolean {
  if (name === "todo_write") {
    return false;
  }

  return verbosity !== "minimal";
}

export function shouldShowToolResultPreview(name: string, verbosity: TerminalVerbosity): boolean {
  if (verbosity === "minimal") {
    return name === "todo_write";
  }

  return true;
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
