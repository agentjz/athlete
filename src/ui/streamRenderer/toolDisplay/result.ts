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
      ok: true,
      tracked: false,
    };
  }

  const output = parsed as Record<string, unknown>;
  const ok = readResultOk(output);
  const tracked = output.externalized === true || typeof output.storagePath === "string" || typeof output.outputPath === "string";
  if (name === "task") {
    const description = readStringField(output, "description");
    const agentType = readStringField(output, "agentType");
    return {
      summary:
        [name, agentType, description ? `"${description}"` : undefined].filter(Boolean).join(" "),
      preview:
        readPrimaryPreview(output, cwd) ??
        formatFallbackObjectPreview(output, cwd) ??
        truncateBlock(rewriteAbsolutePaths(rawOutput, cwd), 1_600),
      ok,
      tracked,
    };
  }

  const displayPath = normalizeDisplayPath(readStringField(output, "path"), cwd);
  const preview =
    readPrimaryPreview(output, cwd) ??
    formatFallbackObjectPreview(output, cwd) ??
    truncateBlock(rewriteAbsolutePaths(rawOutput, cwd), 1_600);

  return {
    summary: [name, displayPath].filter(Boolean).join(" "),
    preview,
    ok,
    tracked,
  };
}

function readResultOk(payload: Record<string, unknown>): boolean {
  if (payload.ok === false) {
    return false;
  }

  if (payload.status === "failed" || payload.status === "timed_out" || payload.status === "stalled" || payload.status === "aborted") {
    return false;
  }

  if (typeof payload.exitCode === "number" && payload.exitCode !== 0) {
    return false;
  }

  return true;
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

function formatFallbackObjectPreview(value: Record<string, unknown>, cwd?: string): string | undefined {
  const keys = ["reason", "error", "hint", "action", "detectedCapability", "documentKind", "candidatePath", "requiredTool"];
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
