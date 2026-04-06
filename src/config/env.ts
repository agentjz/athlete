import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

const managedEnvValues = new Map<string, string>();

export function loadDotEnvFiles(cwd: string): void {
  const originalEnvKeys = new Set(
    Object.entries(process.env)
      .filter(([key, value]) => managedEnvValues.get(key) !== value)
      .map(([key]) => key),
  );

  for (const [key, value] of managedEnvValues) {
    if (originalEnvKeys.has(key) || process.env[key] !== value) {
      continue;
    }

    delete process.env[key];
  }

  managedEnvValues.clear();
  const packageRoot = path.resolve(__dirname, "..");
  const candidateFiles = uniquePaths([
    path.join(packageRoot, ".athlete", ".env"),
    path.join(cwd, ".athlete", ".env"),
  ]);

  for (const filePath of candidateFiles) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const parsed = dotenv.parse(fs.readFileSync(filePath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (originalEnvKeys.has(key)) {
        continue;
      }

      process.env[key] = value;
      managedEnvValues.set(key, value);
    }
  }
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((item) => path.normalize(item)))];
}
