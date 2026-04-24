import fs from "node:fs/promises";
import path from "node:path";

import { isVerificationRequired } from "./state.js";
import type { SessionRecord } from "../../types.js";
import type { VerificationAttempt } from "../../types.js";

const LIGHTWEIGHT_VERIFICATION_EXTENSIONS = new Set([".md", ".txt"]);
const DISALLOWED_LIGHTWEIGHT_ROOTS = new Set([".deadmouse", ".test-build", "dist", "scripts", "src", "tests"]);

export function getLightweightVerificationAttempt(input: {
  toolName: string;
  rawArgs: string;
  pendingPaths: string[];
  resultOk: boolean;
}): VerificationAttempt | null {
  if (!input.resultOk || input.toolName !== "read_file") {
    return null;
  }

  const targetPath = readPathArg(input.rawArgs);
  const normalizedTargetPath = normalizePath(targetPath);
  const normalizedPendingPaths = input.pendingPaths.map(normalizePath);
  if (!normalizedTargetPath || !matchesPendingPath(normalizedTargetPath, normalizedPendingPaths)) {
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
  requiresVerification: boolean;
} {
  return {
    validationAttempted: (session.verificationState?.attempts ?? 0) > 0,
    validationPassed: session.verificationState?.status === "passed",
    requiresVerification: isVerificationRequired(session.verificationState),
  };
}

export async function getAutoVerificationAttempt(input: {
  cwd: string;
  pendingPaths: string[];
}): Promise<VerificationAttempt | null> {
  if (input.pendingPaths.length === 0) {
    return null;
  }

  for (const pendingPath of input.pendingPaths) {
    const normalizedPath = normalizePath(pendingPath);
    if (!isLightweightVerificationPath(normalizedPath)) {
      return null;
    }

    const resolvedPath = path.isAbsolute(pendingPath) ? pendingPath : path.resolve(input.cwd, pendingPath);
    try {
      const stat = await fs.stat(resolvedPath);
      if (!stat.isFile() || stat.size <= 0) {
        return null;
      }
    } catch {
      return null;
    }
  }

  return {
    attempted: true,
    command: `auto_readback ${input.pendingPaths.join(", ")}`,
    exitCode: 0,
    kind: "auto_readback",
    passed: true,
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

function matchesPendingPath(targetPath: string, pendingPaths: string[]): boolean {
  return pendingPaths.some((pendingPath) => pendingPath === targetPath || pendingPath.endsWith(`/${targetPath}`));
}

function isLightweightVerificationPath(value: string): boolean {
  const extension = path.posix.extname(value);
  if (!LIGHTWEIGHT_VERIFICATION_EXTENSIONS.has(extension)) {
    return false;
  }

  const firstSegment = value.split("/").find(Boolean);
  return !firstSegment || !DISALLOWED_LIGHTWEIGHT_ROOTS.has(firstSegment);
}
