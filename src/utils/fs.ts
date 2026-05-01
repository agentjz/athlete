import fs from "node:fs/promises";
import path from "node:path";

export async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export function resolveUserPath(inputPath: string, cwd: string): string {
  const cleanPath = normalizeUserPathInput(inputPath);
  if (path.isAbsolute(cleanPath)) {
    return path.normalize(cleanPath);
  }

  return path.resolve(cwd, cleanPath);
}

export function normalizeUserPathInput(inputPath: string): string {
  const trimmed = inputPath.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }

  return trimmed;
}

export async function ensureParentDirectory(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export function truncateText(input: string, maxChars: number): string {
  if (input.length <= maxChars) {
    return input;
  }

  return `${input.slice(0, maxChars)}\n\n... [truncated ${input.length - maxChars} chars]`;
}

export function formatFileWithLineNumbers(content: string, startLine = 1): string {
  return content
    .split(/\r?\n/)
    .map((line, index) => `${String(startLine + index).padStart(4, " ")} | ${line}`)
    .join("\n");
}
