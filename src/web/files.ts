import fs from "node:fs/promises";
import path from "node:path";

import { resolveProjectPath, toProjectRelativePath } from "./safePath.js";
import { readGitTreeDecorations } from "./git.js";
import type { GitStatusFile } from "./events.js";

const MAX_READ_BYTES = 1024 * 1024;

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
  loaded?: boolean;
  ignored?: boolean;
  gitState?: GitStatusFile;
}

export async function readProjectTree(rootDir: string, relativePath = ""): Promise<FileTreeNode> {
  const absolute = resolveProjectPath(rootDir, relativePath);
  const stat = await fs.stat(absolute);
  if (!stat.isDirectory()) {
    throw new Error("Path is not a directory.");
  }
  const normalizedPath = relativePath ? toProjectRelativePath(rootDir, absolute) : "";
  return {
    name: normalizedPath ? path.basename(absolute) : path.basename(rootDir),
    path: normalizedPath,
    type: "directory",
    loaded: true,
    children: await readDirectoryChildren(rootDir, absolute),
  };
}

async function readDirectoryChildren(rootDir: string, dir: string): Promise<FileTreeNode[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nodes: FileTreeNode[] = [];
  for (const entry of entries.sort(compareDirent)) {
    const absolute = path.join(dir, entry.name);
    const relative = toProjectRelativePath(rootDir, absolute);
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: relative,
        type: "directory",
        loaded: false,
        children: [],
      });
    } else if (entry.isFile()) {
      nodes.push({
        name: entry.name,
        path: relative,
        type: "file",
      });
    }
  }
  const gitDecorations = await readGitTreeDecorations(rootDir, await createGitTreeStateEntries(rootDir, nodes));
  for (const node of nodes) {
    const decoration = gitDecorations.get(node.path);
    node.ignored = decoration?.ignored;
    node.gitState = decoration?.status;
  }
  return nodes;
}

async function createGitTreeStateEntries(rootDir: string, nodes: FileTreeNode[]) {
  return Promise.all(nodes.map(async (node) => {
    const absolute = resolveProjectPath(rootDir, node.path);
    return {
      path: node.path,
      type: node.type,
      childPaths: node.type === "directory" ? await readDirectChildPaths(rootDir, absolute) : [],
    };
  }));
}

async function readDirectChildPaths(rootDir: string, dir: string): Promise<string[]> {
  const children = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  return children
    .filter((entry) => entry.isDirectory() || entry.isFile())
    .map((entry) => toProjectRelativePath(rootDir, path.join(dir, entry.name)));
}

export async function readProjectFile(rootDir: string, relativePath: string): Promise<{
  path: string;
  content: string;
  size: number;
  truncated: boolean;
}> {
  const absolute = resolveProjectPath(rootDir, relativePath);
  const stat = await fs.stat(absolute);
  if (!stat.isFile()) {
    throw new Error("Path is not a file.");
  }
  const handle = await fs.open(absolute, "r");
  try {
    const length = Math.min(stat.size, MAX_READ_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, 0);
    return {
      path: toProjectRelativePath(rootDir, absolute),
      content: buffer.toString("utf8"),
      size: stat.size,
      truncated: stat.size > MAX_READ_BYTES,
    };
  } finally {
    await handle.close();
  }
}

export async function writeProjectFile(rootDir: string, relativePath: string, content: string): Promise<{
  path: string;
  size: number;
}> {
  const absolute = resolveProjectPath(rootDir, relativePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, content, "utf8");
  const stat = await fs.stat(absolute);
  return {
    path: toProjectRelativePath(rootDir, absolute),
    size: stat.size,
  };
}

export async function createProjectFile(rootDir: string, relativePath: string): Promise<{
  path: string;
  size: number;
}> {
  const absolute = resolveProjectPath(rootDir, requireRelativePath(relativePath));
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, "", { encoding: "utf8", flag: "wx" });
  const stat = await fs.stat(absolute);
  return {
    path: toProjectRelativePath(rootDir, absolute),
    size: stat.size,
  };
}

export async function createProjectDirectory(rootDir: string, relativePath: string): Promise<{
  path: string;
}> {
  const absolute = resolveProjectPath(rootDir, requireRelativePath(relativePath));
  await fs.mkdir(absolute);
  return {
    path: toProjectRelativePath(rootDir, absolute),
  };
}

export async function renameProjectPath(rootDir: string, fromPath: string, toPath: string): Promise<{
  from: string;
  to: string;
  type: "file" | "directory";
}> {
  const from = resolveProjectPath(rootDir, requireRelativePath(fromPath));
  const to = resolveProjectPath(rootDir, requireRelativePath(toPath));
  const fromStat = await fs.stat(from);
  await fs.mkdir(path.dirname(to), { recursive: true });
  await assertDestinationAvailable(to);
  await fs.rename(from, to);
  return {
    from: toProjectRelativePath(rootDir, from),
    to: toProjectRelativePath(rootDir, to),
    type: fromStat.isDirectory() ? "directory" : "file",
  };
}

export async function deleteProjectPath(rootDir: string, relativePath: string): Promise<{
  path: string;
  type: "file" | "directory";
}> {
  const absolute = resolveProjectPath(rootDir, requireRelativePath(relativePath));
  const stat = await fs.stat(absolute);
  await fs.rm(absolute, {
    recursive: stat.isDirectory(),
    force: false,
  });
  return {
    path: toProjectRelativePath(rootDir, absolute),
    type: stat.isDirectory() ? "directory" : "file",
  };
}

function compareDirent(left: { isDirectory(): boolean; name: string }, right: { isDirectory(): boolean; name: string }): number {
  if (left.isDirectory() !== right.isDirectory()) {
    return left.isDirectory() ? -1 : 1;
  }
  return left.name.localeCompare(right.name);
}

function requireRelativePath(value: string): string {
  const trimmed = String(value ?? "").trim().replace(/\\/g, "/");
  if (!trimmed || trimmed === ".") {
    throw new Error("Path is required.");
  }
  return trimmed;
}

async function assertDestinationAvailable(absolutePath: string): Promise<void> {
  try {
    await fs.stat(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
  throw new Error("Destination already exists.");
}
