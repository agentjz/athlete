import fs from "node:fs/promises";
import path from "node:path";

export async function waitForRemovedPaths(
  paths: string[],
  attempts = 20,
  delayMs = 50,
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const remaining = await Promise.all(
      paths.map(async (entry) => ({
        entry,
        exists: await pathExists(entry),
      })),
    );

    if (remaining.every((item) => item.exists === false)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

export async function isSameOrDescendant(targetPath: string, possibleAncestor: string): Promise<boolean> {
  if (!targetPath.trim() || !possibleAncestor.trim()) {
    return false;
  }

  const resolvedTarget = await canonicalizePathForComparison(targetPath);
  const resolvedAncestor = await canonicalizePathForComparison(possibleAncestor);
  const relative = path.relative(resolvedAncestor, resolvedTarget);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function canonicalizePathForComparison(targetPath: string): Promise<string> {
  let candidate = path.resolve(targetPath);
  const tail: string[] = [];

  while (true) {
    try {
      const real = await fs.realpath(candidate);
      return tail.length > 0 ? path.join(real, ...tail.reverse()) : real;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        return tail.length > 0 ? path.join(candidate, ...tail.reverse()) : candidate;
      }
    }

    const parent = path.dirname(candidate);
    if (parent === candidate) {
      return tail.length > 0 ? path.join(candidate, ...tail.reverse()) : candidate;
    }

    tail.push(path.basename(candidate));
    candidate = parent;
  }
}
