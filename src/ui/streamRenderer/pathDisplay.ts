import path from "node:path";

export function normalizeDisplayPath(value: string | undefined, cwd?: string): string | undefined {
  if (!value) {
    return value;
  }

  if (!cwd) {
    return value;
  }

  const normalizedCwd = path.resolve(cwd);
  const normalizedValue = path.resolve(value);
  if (
    normalizedValue === normalizedCwd ||
    normalizedValue.startsWith(`${normalizedCwd}${path.sep}`)
  ) {
    return path.relative(normalizedCwd, normalizedValue) || ".";
  }

  return value;
}

export function rewriteAbsolutePaths(value: string, cwd?: string): string {
  if (!cwd) {
    return value;
  }

  const normalizedCwd = path.resolve(cwd).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${normalizedCwd}(?:\\\\[^\\s\"']*|/[^\\s\"']*)*`, "g");

  return value.replace(pattern, (match) => normalizeDisplayPath(match, cwd) ?? match);
}
