import fs from "node:fs/promises";
import path from "node:path";

import type { ProjectIgnoreRule } from "../types.js";

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

  const candidateFiles = uniquePaths([
    path.join(rootDir, ".athlete", ".athleteignore"),
    path.join(cwd, ".athlete", ".athleteignore"),
  ]);

  for (const filePath of candidateFiles) {
    const content = await tryReadUtf8File(filePath);
    if (content === null) {
      continue;
    }

    const baseDir = path.dirname(filePath);
    for (const line of content.split(/\r?\n/)) {
      const rule = compileIgnoreRule(line, {
        baseDir,
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

export function getDefaultAthleteIgnoreContent(): string {
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

  if (directoryOnly) {
    pattern = pattern.replace(/\/+$/, "");
  }

  if (anchored) {
    pattern = pattern.replace(/^\/+/, "");
  }

  if (!pattern) {
    return null;
  }

  if (!pattern.includes("/")) {
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

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((item) => path.normalize(item)))];
}
