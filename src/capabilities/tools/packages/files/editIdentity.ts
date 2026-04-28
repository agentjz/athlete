import { createHash } from "node:crypto";

export interface FileEditIdentity {
  version: 1;
  path: string;
  sha256: string;
  byteLength: number;
  lineCount: number;
}

export function buildFileEditIdentity(path: string, content: string): FileEditIdentity {
  return {
    version: 1,
    path,
    sha256: createHash("sha256").update(content).digest("hex"),
    byteLength: Buffer.byteLength(content, "utf8"),
    lineCount: content.length === 0 ? 0 : content.split(/\r?\n/).length,
  };
}

export function readFileEditIdentity(value: unknown, field: string): FileEditIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Tool argument "${field}" must be an identity object returned by read_file.`);
  }

  const record = value as Record<string, unknown>;
  return {
    version: 1,
    path: readIdentityString(record.path, `${field}.path`),
    sha256: readIdentityString(record.sha256, `${field}.sha256`),
    byteLength: readIdentityNumber(record.byteLength, `${field}.byteLength`),
    lineCount: readIdentityNumber(record.lineCount, `${field}.lineCount`),
  };
}

export function getFileEditIdentityMismatch(
  expected: FileEditIdentity,
  actual: FileEditIdentity,
  resolvedPath: string,
): string | null {
  if (expected.path !== resolvedPath) {
    return "The provided edit identity was issued for a different file path. A fresh read_file identity for the target file is required.";
  }

  if (
    expected.sha256 !== actual.sha256 ||
    expected.byteLength !== actual.byteLength ||
    expected.lineCount !== actual.lineCount
  ) {
    return "The file changed after it was read, so the edit identity is now stale. A fresh read_file identity is required.";
  }

  return null;
}

function readIdentityString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Tool argument "${field}" must be a non-empty string.`);
  }

  return value;
}

function readIdentityNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Tool argument "${field}" must be a non-negative number.`);
  }

  return Math.trunc(value);
}
