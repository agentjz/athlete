import { tryParseJson } from "../../../utils/json.js";
import { normalizeDisplayPath, rewriteAbsolutePaths } from "../pathDisplay.js";
import { truncateBlock } from "../previewPolicy.js";
import { readStringField } from "./shared.js";
import type { ToolDisplay } from "./types.js";

export function buildToolResultDisplay(name: string, rawOutput: string, cwd?: string): ToolDisplay {
  const parsed = tryParseJson(rawOutput);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      summary: name,
      preview: truncateBlock(rawOutput, 1_600),
    };
  }

  const output = parsed as Record<string, unknown>;
  if (name === "task") {
    const description = readStringField(output, "description");
    const agentType = readStringField(output, "agentType");
    return {
      summary:
        [name, agentType, description ? `"${description}"` : undefined].filter(Boolean).join(" "),
      preview:
        readPrimaryPreview(output, cwd) ??
        formatFallbackObjectPreview(output, cwd),
    };
  }

  const displayPath = normalizeDisplayPath(readStringField(output, "path"), cwd);
  const preview =
    readPrimaryPreview(output, cwd) ??
    (name === "list_files" ? formatEntriesPreview(output.entries, cwd) : undefined) ??
    (name === "find_files" ? formatPathListPreview(output.files) : undefined) ??
    (name === "search_files" ? formatMatchesPreview(output.matches, cwd) : undefined) ??
    (name === "read_spreadsheet" ? formatSheetsPreview(output.sheets) : undefined) ??
    formatFallbackObjectPreview(output, cwd);

  return {
    summary: [name, displayPath].filter(Boolean).join(" "),
    preview,
  };
}

function readPrimaryPreview(payload: Record<string, unknown>, cwd?: string): string | undefined {
  for (const key of ["content", "preview", "output", "markdownPreview"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return truncateBlock(rewriteAbsolutePaths(value, cwd), 1_600);
    }
  }

  return undefined;
}

function formatEntriesPreview(value: unknown, cwd?: string): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const lines = value
    .slice(0, 24)
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const type = record.type === "directory" ? "dir " : "file";
      const displayPath = normalizeDisplayPath(readStringField(record, "path"), cwd);
      return displayPath ? `${type} ${displayPath}` : null;
    })
    .filter((line): line is string => Boolean(line));

  return lines.length > 0 ? lines.join("\n") : undefined;
}

function formatPathListPreview(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const lines = value
    .slice(0, 24)
    .map((entry) => (typeof entry === "string" && entry.length > 0 ? entry : null))
    .filter((line): line is string => Boolean(line));

  return lines.length > 0 ? lines.join("\n") : undefined;
}

function formatMatchesPreview(value: unknown, cwd?: string): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const lines = value
    .slice(0, 16)
    .map((match) => {
      if (!match || typeof match !== "object") {
        return null;
      }

      const record = match as Record<string, unknown>;
      const displayPath = normalizeDisplayPath(readStringField(record, "path"), cwd);
      const line = typeof record.line === "number" ? record.line : undefined;
      const text = readStringField(record, "text");
      if (!displayPath || !text) {
        return null;
      }

      return `${displayPath}${line ? `:${line}` : ""}\n  ${text}`;
    })
    .filter((line): line is string => Boolean(line));

  return lines.length > 0 ? lines.join("\n") : undefined;
}

function formatSheetsPreview(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const fragments: string[] = [];

  for (const sheet of value.slice(0, 3)) {
    if (!sheet || typeof sheet !== "object") {
      continue;
    }

    const record = sheet as Record<string, unknown>;
    const name = readStringField(record, "name") ?? "Sheet";
    fragments.push(`sheet: ${name}`);

    if (Array.isArray(record.preview)) {
      for (const row of record.preview.slice(0, 6)) {
        if (!row || typeof row !== "object") {
          continue;
        }

        const rowRecord = row as Record<string, unknown>;
        const cells = Array.isArray(rowRecord.cells)
          ? rowRecord.cells.map((cell) => String(cell)).join(" | ")
          : "";
        if (cells) {
          fragments.push(`  ${cells}`);
        }
      }
    }
  }

  return fragments.length > 0 ? fragments.join("\n") : undefined;
}

function formatFallbackObjectPreview(value: Record<string, unknown>, cwd?: string): string | undefined {
  const keys = ["reason", "error", "hint", "action", "suggestedCapability", "documentKind", "suggestedPath", "suggestedTool"];
  const fragments = keys
    .map((key) => {
      const field = value[key];
      return typeof field === "string" && field.trim().length > 0
        ? `${key}: ${normalizeDisplayPath(field, cwd) ?? rewriteAbsolutePaths(field, cwd)}`
        : null;
    })
    .filter((line): line is string => Boolean(line));

  return fragments.length > 0 ? fragments.join("\n") : undefined;
}
