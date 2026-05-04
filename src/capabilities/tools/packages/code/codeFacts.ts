import fs from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";

import { resolveUserPath } from "../../../../utils/fs.js";
import { isPathIgnored } from "../../../../utils/ignore.js";
import { buildSearchPattern, tryReadTextFile } from "../../core/shared.js";
import type { ToolContext } from "../../core/types.js";

export type CodeSymbolKind =
  | "class"
  | "function"
  | "method"
  | "interface"
  | "type"
  | "enum"
  | "const"
  | "import"
  | "export";

export interface CodeSymbolFact {
  path: string;
  line: number;
  kind: CodeSymbolKind;
  name: string;
  text: string;
  readArgs: ReadArgs;
}

export interface CodeLineFact {
  path: string;
  line: number;
  text: string;
  readArgs: ReadArgs;
}

export interface ReadArgs {
  path: string;
  offset: number;
  limit: number;
}

export const DEFAULT_CODE_GLOB =
  "**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts,py,go,rs,java,kt,kts,cs,c,cpp,h,hpp,rb,php,swift,scala,vue,svelte}";

const MAX_LINE_CHARS = 500;

export async function collectCodeFiles(
  context: ToolContext,
  targetPath: string,
  glob: string | undefined,
  maxFiles = 3_000,
): Promise<{
  root: string;
  files: string[];
}> {
  const resolved = resolveUserPath(targetPath, context.cwd);
  const stats = await fs.stat(resolved);
  const root = stats.isDirectory() ? resolved : path.dirname(resolved);
  const files = stats.isDirectory()
    ? await fg(glob ?? DEFAULT_CODE_GLOB, {
        cwd: root,
        absolute: true,
        dot: true,
        onlyFiles: true,
        suppressErrors: true,
        ignore: ["**/.git/**", "**/node_modules/**", "**/dist/**", "**/coverage/**"],
      })
    : [resolved];

  return {
    root,
    files: files
      .filter((filePath) => !isPathIgnored(filePath, context.projectContext.ignoreRules))
      .sort((left, right) => left.localeCompare(right))
      .slice(0, maxFiles),
  };
}

export async function readCodeLines(
  filePath: string,
  maxReadBytes: number,
): Promise<string[] | null> {
  const content = await tryReadTextFile(filePath, maxReadBytes);
  return content ? content.split(/\r?\n/) : null;
}

export function extractCodeSymbols(filePath: string, lines: string[]): CodeSymbolFact[] {
  const extension = path.extname(filePath).toLowerCase();
  const patterns = selectSymbolPatterns(extension);
  const symbols: CodeSymbolFact[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) {
      continue;
    }

    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      const match = pattern.regex.exec(line);
      const name = match?.groups?.name ?? match?.[1] ?? match?.[2];
      if (!name) {
        continue;
      }

      const lineNumber = index + 1;
      symbols.push({
        path: filePath,
        line: lineNumber,
        kind: pattern.kind,
        name,
        text: truncateLine(line),
        readArgs: buildReadArgs(filePath, lineNumber, lines.length),
      });
      break;
    }
  }

  return symbols;
}

export function filterByQuery<T extends { name?: string; text?: string }>(
  values: T[],
  query: string | undefined,
  literal: boolean,
  ignoreCase: boolean,
): T[] {
  if (!query) {
    return values;
  }

  const regex = buildSearchPattern(query, !ignoreCase, literal);
  return values.filter((value) => {
    regex.lastIndex = 0;
    return regex.test(value.name ?? value.text ?? "");
  });
}

export function findIdentifierReferences(
  filePath: string,
  lines: string[],
  symbol: string,
  contextLines: number,
): CodeLineFact[] {
  const regex = new RegExp(`\\b${escapeRegex(symbol)}\\b`, "g");
  const results: CodeLineFact[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    regex.lastIndex = 0;
    if (!regex.test(line)) {
      continue;
    }

    const lineNumber = index + 1;
    results.push({
      path: filePath,
      line: lineNumber,
      text: truncateLine(line),
      readArgs: buildReadArgs(filePath, lineNumber, lines.length, contextLines),
    });
  }

  return results;
}

export function buildReadArgs(filePath: string, line: number, totalLines: number, contextLines = 3): ReadArgs {
  const offset = Math.max(1, line - contextLines);
  const endLine = Math.min(totalLines, line + contextLines);
  return {
    path: filePath,
    offset,
    limit: Math.max(1, endLine - offset + 1),
  };
}

export function truncateLine(value: string): string {
  return value.length <= MAX_LINE_CHARS
    ? value
    : `${value.slice(0, MAX_LINE_CHARS)}... [line truncated]`;
}

function selectSymbolPatterns(extension: string): Array<{
  kind: CodeSymbolKind;
  regex: RegExp;
}> {
  if (extension === ".py") {
    return [
      { kind: "class", regex: /^\s*class\s+(?<name>[A-Za-z_][\w]*)\b/ },
      { kind: "function", regex: /^\s*def\s+(?<name>[A-Za-z_][\w]*)\s*\(/ },
      { kind: "import", regex: /^\s*(?:from\s+([A-Za-z_][\w.]*)\s+import|import\s+([A-Za-z_][\w.]*))/ },
    ];
  }

  if (extension === ".go") {
    return [
      { kind: "function", regex: /^\s*func\s+(?:\([^)]*\)\s*)?(?<name>[A-Za-z_][\w]*)\s*\(/ },
      { kind: "type", regex: /^\s*type\s+(?<name>[A-Za-z_][\w]*)\b/ },
      { kind: "const", regex: /^\s*const\s+(?<name>[A-Za-z_][\w]*)\b/ },
    ];
  }

  if (extension === ".rs") {
    return [
      { kind: "function", regex: /^\s*(?:pub\s+)?fn\s+(?<name>[A-Za-z_][\w]*)\s*\(/ },
      { kind: "class", regex: /^\s*(?:pub\s+)?struct\s+(?<name>[A-Za-z_][\w]*)\b/ },
      { kind: "enum", regex: /^\s*(?:pub\s+)?enum\s+(?<name>[A-Za-z_][\w]*)\b/ },
      { kind: "type", regex: /^\s*(?:pub\s+)?trait\s+(?<name>[A-Za-z_][\w]*)\b/ },
      { kind: "const", regex: /^\s*(?:pub\s+)?const\s+(?<name>[A-Za-z_][\w]*)\b/ },
    ];
  }

  return [
    { kind: "import", regex: /^\s*import\s+(?:type\s+)?(?<name>[\w*{}\s,]+?)\s+from\b/ },
    { kind: "class", regex: /^\s*(?:export\s+default\s+|export\s+)?class\s+(?<name>[A-Za-z_$][\w$]*)\b/ },
    { kind: "interface", regex: /^\s*(?:export\s+)?interface\s+(?<name>[A-Za-z_$][\w$]*)\b/ },
    { kind: "type", regex: /^\s*(?:export\s+)?type\s+(?<name>[A-Za-z_$][\w$]*)\b/ },
    { kind: "enum", regex: /^\s*(?:export\s+)?enum\s+(?<name>[A-Za-z_$][\w$]*)\b/ },
    { kind: "function", regex: /^\s*(?:export\s+)?(?:async\s+)?function\s+(?<name>[A-Za-z_$][\w$]*)\s*\(/ },
    { kind: "const", regex: /^\s*(?:export\s+)?(?:const|let|var)\s+(?<name>[A-Za-z_$][\w$]*)\s*=/ },
    { kind: "method", regex: /^\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+)*(?<name>[A-Za-z_$][\w$]*)\s*\([^)]*\)\s*[:{]/ },
    { kind: "export", regex: /^\s*export\s+(?:default\s+)?(?<name>[A-Za-z_$][\w$]*)\b/ },
  ];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
