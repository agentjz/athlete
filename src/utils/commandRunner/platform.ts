import { joinWithAndSemantics, splitByAndAnd } from "./platformArgs.js";
import { normalizeWindowsSegment, startsWithExplicitShell } from "./platformTransforms.js";

export function normalizeCommandForPlatform(command: string): string {
  if (process.platform !== "win32") {
    return command;
  }

  const trimmed = command.trim();
  if (!trimmed) {
    return command;
  }

  const normalized = normalizeWindowsCommand(trimmed);
  return normalizeNpmShims(normalized);
}

function normalizeWindowsCommand(command: string): string {
  if (startsWithExplicitShell(command)) {
    return command;
  }

  const segments = splitByAndAnd(command);
  const normalizedSegments = segments.map((segment) => normalizeWindowsSegment(segment));
  return joinWithAndSemantics(normalizedSegments);
}

function normalizeNpmShims(command: string): string {
  const shims: Record<string, string> = {
    npm: "npm.cmd",
    npx: "npx.cmd",
    pnpm: "pnpm.cmd",
    yarn: "yarn.cmd",
  };

  const pattern = /(^|[;&|]|\&\&)\s*(npm|npx|pnpm|yarn)(?=\s|$)/gi;
  return command.replace(pattern, (match, prefix, tool) => {
    const replacement = shims[String(tool).toLowerCase()];
    if (!replacement) {
      return match;
    }
    if (!prefix) {
      return replacement;
    }
    return `${prefix} ${replacement}`;
  });
}
