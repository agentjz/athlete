import path from "node:path";

export function toToolRelativePath(cwd: string, targetPath: string): string {
  const relative = path.relative(cwd, targetPath);
  if (!relative || relative === "") {
    return ".";
  }
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return targetPath;
  }
  return relative.replace(/\\/g, "/");
}
