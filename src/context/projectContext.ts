import fs from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";

import { resolveProjectRoots } from "./repoRoots.js";
import type { LoadedInstructionFile, ProjectContext } from "../types.js";
import { isPathIgnored, loadProjectIgnoreRules } from "../utils/ignore.js";

export async function loadProjectContext(cwd: string, input: {
  projectDocMaxBytes: number;
}): Promise<ProjectContext> {
  const roots = await resolveProjectRoots(cwd);
  const instructions = await getInstructionFiles(roots.rootDir, cwd);
  const { content, truncated } = concatInstructionFiles(instructions, input.projectDocMaxBytes);
  const ignoreRules = await loadProjectIgnoreRules(roots.rootDir, cwd);

  return {
    rootDir: roots.rootDir,
    stateRootDir: roots.stateRootDir,
    cwd,
    instructions,
    instructionText: content,
    instructionTruncated: truncated,
    ignoreRules,
  };
}

async function getInstructionFiles(rootDir: string, cwd: string): Promise<LoadedInstructionFile[]> {
  const directories = getDirectoriesFromRootToCwd(rootDir, cwd);
  const results: LoadedInstructionFile[] = [];

  for (const directory of directories) {
    const overridePath = path.join(directory, "AGENTS.override.md");
    const agentsPath = path.join(directory, "AGENTS.md");

    if (await isRegularFile(overridePath)) {
      results.push(await readInstructionFile(rootDir, overridePath, "AGENTS.override.md"));
      continue;
    }

    if (await isRegularFile(agentsPath)) {
      results.push(await readInstructionFile(rootDir, agentsPath, "AGENTS.md"));
    }
  }

  return results;
}

function getDirectoriesFromRootToCwd(rootDir: string, cwd: string): string[] {
  const absoluteRoot = path.resolve(rootDir);
  const absoluteCwd = path.resolve(cwd);
  const relativePath = path.relative(absoluteRoot, absoluteCwd);

  if (!relativePath || relativePath === ".") {
    return [absoluteRoot];
  }

  const parts = relativePath.split(path.sep).filter(Boolean);
  const directories = [absoluteRoot];

  for (let index = 0; index < parts.length; index += 1) {
    directories.push(path.join(absoluteRoot, ...parts.slice(0, index + 1)));
  }

  return directories;
}

async function isRegularFile(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function readInstructionFile(
  rootDir: string,
  absolutePath: string,
  filename: LoadedInstructionFile["filename"],
): Promise<LoadedInstructionFile> {
  return {
    path: absolutePath,
    relativePath: path.relative(rootDir, absolutePath) || filename,
    filename,
    content: await fs.readFile(absolutePath, "utf8"),
  };
}

function concatInstructionFiles(files: LoadedInstructionFile[], maxBytes: number): { content: string; truncated: boolean } {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new Error("Missing or invalid projectDocMaxBytes runtime config.");
  }
  let totalBytes = 0;
  let truncated = false;
  const parts: string[] = [];

  for (const file of files) {
    if (!file.content.trim()) {
      continue;
    }

    const heading = `# ${file.filename}\n\nPath: ${file.relativePath}\n\n`;
    const block = `${heading}${file.content}`.trimEnd();
    const separator = parts.length > 0 ? "\n\n" : "";
    const blockBytes = Buffer.byteLength(separator + block, "utf8");

    if (totalBytes + blockBytes <= maxBytes) {
      parts.push(`${separator}${block}`);
      totalBytes += blockBytes;
      continue;
    }

    truncated = true;
    const remainingBytes = Math.max(0, maxBytes - totalBytes - Buffer.byteLength(separator, "utf8"));
    const suffix = "\n\n... (project instructions truncated)";
    const suffixBytes = Buffer.byteLength(suffix, "utf8");
    const prefixBudget = Math.max(0, remainingBytes - suffixBytes);
    const prefix = truncateUtf8(block, prefixBudget);
    parts.push(`${separator}${prefix}${suffix}`);
    break;
  }

  return {
    content: parts.join(""),
    truncated,
  };
}

function truncateUtf8(value: string, bytes: number): string {
  const buffer = Buffer.from(value, "utf8");
  if (buffer.length <= bytes) {
    return value;
  }

  return buffer.subarray(0, Math.max(0, bytes)).toString("utf8");
}

async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((item) => path.normalize(item)))];
}
