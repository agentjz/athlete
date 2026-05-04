import path from "node:path";

export function resolveProjectPath(rootDir: string, relativePath: string): string {
  const normalized = String(relativePath ?? "").replace(/\\/g, "/");
  if (normalized.includes("\0")) {
    throw new Error("Path is required.");
  }

  const resolved = normalized ? path.resolve(rootDir, normalized) : path.resolve(rootDir);
  const root = path.resolve(rootDir);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Path is outside the project root.");
  }
  return resolved;
}

export function toProjectRelativePath(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).replace(/\\/g, "/");
}
