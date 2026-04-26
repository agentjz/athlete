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

export function shouldShowToolCallPreview(name: string, verbosity: TerminalVerbosity): boolean {
  return false;
}

export function shouldShowToolResultPreview(name: string, verbosity: TerminalVerbosity): boolean {
  return name === "todo_write";
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
    ui.plain(preview);
    return;
  }

  ui.plain(`[${label}]\n${preview}`);
}
