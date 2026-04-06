import fs from "node:fs/promises";
import path from "node:path";

import type { ResolvedMcpServerDefinition } from "../types.js";

export async function normalizePlaywrightToolInput(
  server: ResolvedMcpServerDefinition,
  toolName: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (server.name !== "playwright") {
    return input;
  }

  const outputDir = readFlagValue(server.args, "--output-dir");
  if (!outputDir) {
    return input;
  }

  if (typeof input.filename === "string" && input.filename.trim().length > 0) {
    const filename = resolvePlaywrightOutputPath(outputDir, input.filename);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    return {
      ...input,
      filename,
    };
  }

  if (toolName === "browser_take_screenshot") {
    return input;
  }

  return input;
}

function resolvePlaywrightOutputPath(outputDir: string, filename: string): string {
  if (path.isAbsolute(filename)) {
    return path.normalize(filename);
  }

  const normalizedOutputDir = path.resolve(outputDir);
  const resolved = path.resolve(normalizedOutputDir, filename);
  if (resolved === normalizedOutputDir || resolved.startsWith(`${normalizedOutputDir}${path.sep}`)) {
    return resolved;
  }

  return path.join(normalizedOutputDir, path.basename(filename));
}

function readFlagValue(args: string[], flagName: string): string {
  const index = args.indexOf(flagName);
  if (index < 0) {
    return "";
  }

  return String(args[index + 1] ?? "");
}
