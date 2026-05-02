import fs from "node:fs/promises";
import path from "node:path";

export const TEXT_EXTENSIONS = new Set([
  ".cmd",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".txt",
  ".yml",
  ".yaml",
]);

const IGNORED_DIRECTORIES = new Set([
  ".kitty",
  ".git",
  ".test-build",
  "dist",
  "node_modules",
]);

export async function listTextFiles(root, roots) {
  const files = [];
  for (const relativeRoot of roots) {
    const fullRoot = path.join(root, relativeRoot);
    if (await exists(fullRoot)) {
      await collectFiles(root, fullRoot, files);
    }
  }
  files.push("package.json");
  return [...new Set(files.map(normalizePath))].sort();
}

export async function readTextFileMap(root, files) {
  const contents = new Map();
  for (const file of files) {
    contents.set(file, await fs.readFile(path.join(root, file), "utf8"));
  }
  return contents;
}

export async function exists(fullPath) {
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

export function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

export function lineNumberAt(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

async function collectFiles(root, directory, files) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        await collectFiles(root, fullPath, files);
      }
      continue;
    }
    if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.relative(root, fullPath));
    }
  }
}
