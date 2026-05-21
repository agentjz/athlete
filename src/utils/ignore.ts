import fs from "node:fs/promises";
import path from "node:path";

import type { ProjectIgnoreRule } from "../types.js";
import { PROJECT_STATE_DIR_NAME, PROJECT_STATE_IGNORE_FILE_NAME } from "../project/statePaths.js";

const BUILTIN_PATTERNS = [
  ".git/",
  "node_modules/",
  "dist/",
  "coverage/",
];

export async function loadProjectIgnoreRules(rootDir: string, cwd: string): Promise<ProjectIgnoreRule[]> {
  const rules: ProjectIgnoreRule[] = BUILTIN_PATTERNS
    .map((pattern) => compileIgnoreRule(pattern, {
      baseDir: rootDir,
      source: "builtin",
    }))
    .filter((rule): rule is ProjectIgnoreRule => Boolean(rule));

  const candidateFiles = uniqueIgnoreFiles([
    {
      path: path.join(rootDir, PROJECT_STATE_DIR_NAME, PROJECT_STATE_IGNORE_FILE_NAME),
      baseDir: rootDir,
    },
    {
      path: path.join(cwd, PROJECT_STATE_DIR_NAME, PROJECT_STATE_IGNORE_FILE_NAME),
      baseDir: cwd,
    },
  ]);

  for (const candidate of candidateFiles) {
    const filePath = candidate.path;
    const content = await tryReadUtf8File(filePath);
    if (content === null) {
      continue;
    }

    for (const line of content.split(/\r?\n/)) {
      const rule = compileIgnoreRule(line, {
        baseDir: candidate.baseDir,
        source: filePath,
      });
      if (rule) {
        rules.push(rule);
      }
    }
  }

  return rules;
}

export function isPathIgnored(
  targetPath: string,
  rules: ProjectIgnoreRule[],
  isDirectory = false,
): boolean {
  let ignored = false;

  for (const rule of rules) {
    const relativePath = toRelativePosix(rule.baseDir, targetPath);
    if (!relativePath) {
      continue;
    }

    const candidate = isDirectory ? ensureTrailingSlash(relativePath) : relativePath;
    if (!rule.matcher.test(candidate)) {
      continue;
    }

    ignored = !rule.negated;
  }

  return ignored;
}

export function buildFastGlobIgnorePatterns(baseDir: string, rules: ProjectIgnoreRule[]): string[] {
  if (rules.some((rule) => rule.negated)) {
    return [];
  }

  const patterns: string[] = [];

  for (const rule of rules) {
    if (rule.negated) {
      continue;
    }

    const relativeBase = toRelativePosix(baseDir, rule.baseDir);
    if (relativeBase === null) {
      continue;
    }

    const pattern = normalizeFastGlobIgnorePattern(rule);
    if (!pattern) {
      continue;
    }

    patterns.push(relativeBase ? `${relativeBase}/${pattern}` : pattern);
  }

  return [...new Set(patterns)];
}

export function getDefaultKittyIgnoreContent(): string {
  return [
    ".git/",
    "node_modules/",
    "dist/",
    "coverage/",
    "",
  ].join("\n");
}

async function tryReadUtf8File(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function compileIgnoreRule(
  rawPattern: string,
  options: {
    baseDir: string;
    source: string;
  },
): ProjectIgnoreRule | null {
  const trimmed = rawPattern.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const negated = trimmed.startsWith("!");
  let pattern = negated ? trimmed.slice(1).trim() : trimmed;
  if (!pattern) {
    return null;
  }

  pattern = pattern.replace(/\\/g, "/").replace(/^\.\/+/, "");
  const directoryOnly = pattern.endsWith("/");
  const anchored = pattern.startsWith("/");
  const originalHadSlash = pattern.includes("/");

  if (directoryOnly) {
    pattern = pattern.replace(/\/+$/, "");
  }

  if (anchored) {
    pattern = pattern.replace(/^\/+/, "");
  }

  if (!pattern) {
    return null;
  }

  if (!originalHadSlash) {
    pattern = `**/${pattern}`;
  } else if (!anchored && !pattern.startsWith("**/")) {
    pattern = `**/${pattern}`;
  }

  if (directoryOnly) {
    pattern = pattern.endsWith("/**") ? pattern : `${pattern}/**`;
  }

  return {
    pattern: trimmed,
    source: options.source,
    baseDir: options.baseDir,
    negated,
    directoryOnly,
    anchored,
    matcher: new RegExp(`^${globToRegex(pattern)}$`),
  };
}

function toRelativePosix(baseDir: string, targetPath: string): string | null {
  const relativePath = path.relative(path.resolve(baseDir), path.resolve(targetPath));
  if (!relativePath || relativePath === ".") {
    return "";
  }

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return relativePath.replace(/\\/g, "/");
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeFastGlobIgnorePattern(rule: ProjectIgnoreRule): string | null {
  const trimmed = rule.pattern.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) {
    return null;
  }

  let pattern = trimmed.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
  if (!pattern) {
    return null;
  }

  if (pattern.endsWith("/")) {
    pattern = `${pattern}**`;
  }

  if (!pattern.includes("/")) {
    pattern = `**/${pattern}`;
  } else if (!rule.anchored && !pattern.startsWith("**/")) {
    pattern = `**/${pattern}`;
  }

  return pattern;
}

function globToRegex(pattern: string): string {
  let result = "";

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index] ?? "";
    const next = pattern[index + 1] ?? "";

    if (char === "*") {
      if (next === "*") {
        const afterDoubleStar = pattern[index + 2] ?? "";
        if (afterDoubleStar === "/") {
          result += "(?:.*\\/)?";
          index += 2;
        } else {
          result += ".*";
          index += 1;
        }
        continue;
      }

      result += "[^/]*";
      continue;
    }

    if (char === "?") {
      result += "[^/]";
      continue;
    }

    if (char === "/") {
      result += "/";
      continue;
    }

    result += escapeRegex(char);
  }

  return result;
}

function escapeRegex(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function uniqueIgnoreFiles(files: Array<{ path: string; baseDir: string }>): Array<{ path: string; baseDir: string }> {
  const seen = new Set<string>();
  const unique: Array<{ path: string; baseDir: string }> = [];

  for (const file of files) {
    const normalizedPath = path.normalize(file.path);
    if (seen.has(normalizedPath)) {
      continue;
    }

    seen.add(normalizedPath);
    unique.push({
      path: normalizedPath,
      baseDir: path.resolve(file.baseDir),
    });
  }

  return unique;
}
