import path from "node:path";

import fg from "fast-glob";

import type { ProjectContext } from "../types.js";
import { isPathIgnored } from "../utils/ignore.js";

export async function findPathSuggestions(
  cwd: string,
  requestedPath: string,
  projectContext: Pick<ProjectContext, "ignoreRules">,
  limit = 8,
): Promise<string[]> {
  const normalized = requestedPath.replace(/\\/g, "/");
  const baseName = path.basename(normalized).trim();
  const needle = baseName.length > 0 ? baseName : normalized.trim();

  if (!needle) {
    return [];
  }

  const patterns = buildCandidatePatterns(needle);
  const matches = new Set<string>();

  for (const pattern of patterns) {
    const entries = await fg(pattern, {
      cwd,
      dot: true,
      onlyFiles: false,
      markDirectories: true,
      caseSensitiveMatch: false,
      suppressErrors: true,
      ignore: ["**/.git/**", "**/node_modules/**", "**/dist/**", "**/coverage/**"],
    });

    for (const entry of entries) {
      const absolutePath = path.resolve(cwd, entry);
      const isDirectory = entry.endsWith("/");
      if (isPathIgnored(absolutePath, projectContext.ignoreRules, isDirectory)) {
        continue;
      }

      matches.add(entry.replace(/\//g, "\\").replace(/[\\]+$/, ""));
      if (matches.size >= limit) {
        return [...matches].slice(0, limit);
      }
    }
  }

  return [...matches].slice(0, limit);
}

function buildCandidatePatterns(needle: string): string[] {
  const clean = needle.replace(/[*?[\]{}]/g, "");

  return [
    `**/${clean}`,
    `**/*${clean}*`,
  ];
}
