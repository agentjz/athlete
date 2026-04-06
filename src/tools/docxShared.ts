import type { DocxSourceFormat } from "../documents/docx/index.js";

export function readDocxSourceFormat(value: unknown, fallback: DocxSourceFormat = "markdown"): DocxSourceFormat {
  if (value === undefined) {
    return fallback;
  }

  if (value === "plain_text" || value === "markdown") {
    return value;
  }

  throw new Error('Tool argument "format" must be "plain_text" or "markdown".');
}

export function replaceExtension(targetPath: string, nextExtension: string): string {
  const extension = targetPath.match(/\.[^.]+$/)?.[0];
  return extension ? targetPath.slice(0, -extension.length) + nextExtension : `${targetPath}${nextExtension}`;
}

export function readTemplateVariables(value: unknown): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error('Tool argument "variables" must be a JSON object.');
  }

  return value as Record<string, unknown>;
}

export function readHeadingLevel(value: unknown, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error('Tool argument "heading_level" must be a number between 1 and 6.');
  }

  return Math.max(1, Math.min(6, Math.trunc(value)));
}
