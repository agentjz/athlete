import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import { promisify } from "node:util";

import type { GitStatusFile } from "./events.js";

const execFileAsync = promisify(execFile);
const GIT_MAX_BUFFER = 8 * 1024 * 1024;

export interface GitTreeStateEntry {
  path: string;
  type: "file" | "directory";
  childPaths?: string[];
}

export interface GitTreeDecoration {
  path: string;
  ignored: boolean;
  status?: GitStatusFile;
}

export async function readGitStatus(cwd: string): Promise<GitStatusFile[]> {
  const result = await runGit(cwd, ["status", "--porcelain=v1", "--ignored=matching"]);
  if (!result.ok) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => ({
      index: line.slice(0, 1),
      workingTree: line.slice(1, 2),
      path: normalizeGitPath(line.slice(3).trim()),
      ignored: line.slice(0, 2) === "!!",
    }));
}

export async function readGitDiff(cwd: string, relativePath?: string): Promise<string> {
  const args = ["diff", "--"];
  if (relativePath) {
    args.push(relativePath);
  }
  return (await runGit(cwd, args)).stdout;
}

export async function readGitSummary(cwd: string): Promise<{
  filesChanged: number;
  insertions: number;
  deletions: number;
}> {
  const result = await runGit(cwd, ["diff", "--numstat"]);
  if (!result.ok) {
    return { filesChanged: 0, insertions: 0, deletions: 0 };
  }

  let filesChanged = 0;
  let insertions = 0;
  let deletions = 0;
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const [added, removed] = line.split(/\s+/);
    filesChanged += 1;
    insertions += parseNumstatValue(added);
    deletions += parseNumstatValue(removed);
  }
  return { filesChanged, insertions, deletions };
}

export async function readGitTreeStates(cwd: string, entries: GitTreeStateEntry[]): Promise<Map<string, GitStatusFile>> {
  const decorations = await readGitTreeDecorations(cwd, entries);
  return new Map([...decorations].flatMap(([path, decoration]) => decoration.status ? [[path, decoration.status]] : []));
}

export async function readGitTreeDecorations(cwd: string, entries: GitTreeStateEntry[]): Promise<Map<string, GitTreeDecoration>> {
  const normalizedEntries = entries
    .map((entry) => ({
      path: normalizeGitPath(entry.path),
      type: entry.type,
      childPaths: (entry.childPaths ?? []).map(normalizeGitPath).filter(Boolean),
    }))
    .filter((entry) => entry.path);
  if (normalizedEntries.length === 0) {
    return new Map();
  }

  const statusFiles = await readGitStatus(cwd);
  const statusByPath = new Map(statusFiles.map((file) => [normalizeGitPath(file.path), file]));
  const checkPaths = [...new Set(normalizedEntries.flatMap((entry) => [entry.path, ...entry.childPaths]))];
  const ignoredPaths = await readGitIgnoredPathSet(cwd, checkPaths);
  const decorations = new Map<string, GitTreeDecoration>();

  for (const entry of normalizedEntries) {
    const directlyIgnored = ignoredPaths.has(entry.path);
    const containsIgnoredChildren = hasIgnoredChildPath(entry, ignoredPaths);
    let status: GitStatusFile | undefined;

    if (directlyIgnored) {
      status = {
        path: entry.path,
        index: "!",
        workingTree: "!",
        ignored: true,
      };
    } else {
      const exact = statusByPath.get(entry.path);
      if (exact) {
        status = exact;
      } else if (entry.type === "directory") {
        const descendant = statusFiles.find((file) => !file.ignored && isSameOrChildPath(entry.path, normalizeGitPath(file.path)));
        if (descendant) {
          status = {
            ...descendant,
            path: entry.path,
          };
        }
      }
    }

    decorations.set(entry.path, {
      path: entry.path,
      ignored: directlyIgnored || containsIgnoredChildren,
      status,
    });
  }

  return decorations;
}

export async function readGitIgnoredPathSet(cwd: string, paths: string[]): Promise<Set<string>> {
  const normalizedPaths = [...new Set(paths.map(normalizeGitPath).filter(Boolean))];
  if (normalizedPaths.length === 0) {
    return new Set();
  }
  const result = await runGitWithInput(cwd, ["check-ignore", "--stdin", "-z"], `${normalizedPaths.join("\0")}\0`);
  if (!result.ok && !result.stdout) {
    return new Set();
  }
  return new Set(result.stdout.split("\0").map(normalizeGitPath).filter(Boolean));
}

function parseNumstatValue(value: string | undefined): number {
  if (!value || value === "-") {
    return 0;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : 0;
}

async function runGit(cwd: string, args: string[]): Promise<{
  ok: boolean;
  stdout: string;
}> {
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      maxBuffer: GIT_MAX_BUFFER,
      windowsHide: true,
    });
    return {
      ok: true,
      stdout: result.stdout,
    };
  } catch (error) {
    return {
      ok: false,
      stdout: String((error as { stdout?: unknown }).stdout ?? ""),
    };
  }
}

function runGitWithInput(cwd: string, args: string[], input: string): Promise<{
  ok: boolean;
  stdout: string;
}> {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "ignore"],
    });
    const stdout: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.once("error", () => resolve({ ok: false, stdout: "" }));
    child.once("close", (code) => resolve({
      ok: code === 0,
      stdout: Buffer.concat(stdout).toString("utf8"),
    }));
    child.stdin.end(input);
  });
}

function normalizeGitPath(value: string): string {
  return String(value ?? "").replace(/\\/g, "/").replace(/\/+$/g, "");
}

function isSameOrChildPath(parent: string, child: string): boolean {
  return child === parent || child.startsWith(`${parent}/`);
}

function hasIgnoredChildPath(entry: {
  type: "file" | "directory";
  childPaths: string[];
}, ignoredPaths: Set<string>): boolean {
  return entry.type === "directory"
    && entry.childPaths.length > 0
    && entry.childPaths.some((childPath) => ignoredPaths.has(childPath));
}
