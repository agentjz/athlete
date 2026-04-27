import { createHash } from "node:crypto";

export interface FileEditAnchor {
  version: 1;
  path: string;
  line: number;
  hash: string;
  preview?: string;
}

export function buildFileEditAnchor(path: string, line: number, lineText: string): FileEditAnchor {
  return {
    version: 1,
    path,
    line,
    hash: createLineAnchorHash(lineText),
    preview: lineText.length <= 160 ? lineText : `${lineText.slice(0, 160)}...`,
  };
}

export function readFileEditAnchor(value: unknown, field: string): FileEditAnchor {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Tool argument "${field}" must be an anchor object returned by read_file.`);
  }

  const record = value as Record<string, unknown>;
  return {
    version: 1,
    path: readAnchorString(record.path, `${field}.path`),
    line: readAnchorNumber(record.line, `${field}.line`),
    hash: readAnchorString(record.hash, `${field}.hash`),
    preview: typeof record.preview === "string" ? record.preview : undefined,
  };
}

export function createLineAnchorHash(lineText: string): string {
  return createHash("sha256").update(lineText).digest("hex");
}

function readAnchorString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Tool argument "${field}" must be a non-empty string.`);
  }

  return value;
}

function readAnchorNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Tool argument "${field}" must be a positive number.`);
  }

  return Math.trunc(value);
}
