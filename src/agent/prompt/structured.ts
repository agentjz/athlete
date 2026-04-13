import { formatPromptBlock } from "./format.js";

export interface PromptField {
  label: string;
  value?: string;
}

export interface PromptListSection {
  title: string;
  lines: string[];
}

export function buildFieldBlock(title: string, fields: PromptField[]): string | undefined {
  const lines = fields
    .filter((field) => typeof field.value === "string" && field.value.trim().length > 0)
    .map((field) => `- ${field.label}: ${field.value}`);

  return lines.length > 0 ? formatPromptBlock(title, lines.join("\n")) : undefined;
}

export function buildSectionedListBlock(
  title: string,
  sections: PromptListSection[],
): string | undefined {
  const renderedSections = sections
    .map((section) => renderSection(section))
    .filter((section): section is string => section.length > 0);

  return renderedSections.length > 0
    ? formatPromptBlock(title, renderedSections.join("\n\n"))
    : undefined;
}

export function createSummarySection(
  title: string,
  summary: string | undefined,
  options: {
    maxLines?: number;
    dropPrefixes?: string[];
  } = {},
): PromptListSection | undefined {
  const lines = normalizeSummaryLines(summary, options);
  return lines.length > 0 ? { title, lines } : undefined;
}

export function normalizeSummaryLines(
  summary: string | undefined,
  options: {
    maxLines?: number;
    dropPrefixes?: string[];
  } = {},
): string[] {
  const normalized = String(summary ?? "").trim();
  if (!normalized) {
    return [];
  }

  const dropPrefixes = (options.dropPrefixes ?? []).map((prefix) => prefix.toLowerCase());
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !dropPrefixes.some((prefix) => line.toLowerCase().startsWith(prefix)))
    .map(stripBulletPrefix);

  return limitSummaryLines(lines, options.maxLines);
}

function renderSection(section: PromptListSection): string {
  const lines = section.lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `- ${line}`);
  if (lines.length === 0) {
    return "";
  }

  return `${section.title}:\n${lines.join("\n")}`;
}

function limitSummaryLines(lines: string[], maxLines = lines.length): string[] {
  if (lines.length <= maxLines) {
    return lines;
  }

  return [...lines.slice(0, maxLines), `+${lines.length - maxLines} more`];
}

function stripBulletPrefix(line: string): string {
  return line.replace(/^[-*]\s+/, "").trim();
}
