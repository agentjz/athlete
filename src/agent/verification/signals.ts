import path from "node:path";

import type { SessionRecord, VerificationAttempt } from "../../types.js";

const LIGHTWEIGHT_VERIFICATION_EXTENSIONS = new Set([".md", ".txt"]);
const DISALLOWED_LIGHTWEIGHT_ROOTS = new Set([".deadmouse", ".test-build", "dist", "scripts", "src", "tests"]);

export function getLightweightVerificationAttempt(input: {
  toolName: string;
  rawArgs: string;
  observedPaths: string[];
  resultOk: boolean;
}): VerificationAttempt | null {
  if (!input.resultOk || input.toolName !== "read_file") {
    return null;
  }

  const targetPath = readPathArg(input.rawArgs);
  const normalizedTargetPath = normalizePath(targetPath);
  const normalizedObservedPaths = input.observedPaths.map(normalizePath);
  if (!normalizedTargetPath || !matchesObservedPath(normalizedTargetPath, normalizedObservedPaths)) {
    return null;
  }

  if (!isLightweightVerificationPath(normalizedTargetPath)) {
    return null;
  }

  return {
    attempted: true,
    command: `read_file ${targetPath}`,
    exitCode: 0,
    kind: "read_file",
    passed: true,
  };
}

export function readVerificationProgress(session: Pick<SessionRecord, "verificationState">): {
  validationAttempted: boolean;
  validationPassed: boolean;
} {
  return {
    validationAttempted: (session.verificationState?.attempts ?? 0) > 0,
    validationPassed: session.verificationState?.status === "passed",
  };
}

function readPathArg(rawArgs: string): string | null {
  try {
    const parsed = JSON.parse(rawArgs) as Record<string, unknown>;
    return typeof parsed.path === "string" ? parsed.path : null;
  } catch {
    return null;
  }
}

function normalizePath(value: string | null): string {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\/+/, "").trim().toLowerCase();
}

function matchesObservedPath(targetPath: string, observedPaths: string[]): boolean {
  return observedPaths.some((observedPath) => observedPath === targetPath || observedPath.endsWith(`/${targetPath}`));
}

function isLightweightVerificationPath(value: string): boolean {
  const extension = path.posix.extname(value);
  if (!LIGHTWEIGHT_VERIFICATION_EXTENSIONS.has(extension)) {
    return false;
  }

  const firstSegment = value.split("/").find(Boolean);
  return !firstSegment || !DISALLOWED_LIGHTWEIGHT_ROOTS.has(firstSegment);
}
