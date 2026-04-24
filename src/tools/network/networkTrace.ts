import fs from "node:fs/promises";
import path from "node:path";

import { getProjectStatePaths } from "../../project/statePaths.js";
import { resolveUserPath } from "../../utils/fs.js";

export interface NetworkTraceRequestSummary {
  method: string;
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: string;
}

export interface NetworkTraceResponseSummary {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string;
  durationMs?: number;
}

export interface NetworkTraceAssertionResult {
  name: string;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
  message?: string;
}

export interface NetworkTraceRecord {
  traceId: string;
  recordedAt: string;
  summary?: string;
  request: NetworkTraceRequestSummary;
  response: NetworkTraceResponseSummary;
  assertions: NetworkTraceAssertionResult[];
}

export interface NetworkTraceWriteResult {
  absolutePath: string;
  relativePath: string;
}

export function createNetworkTraceRecord(input: {
  traceId?: string;
  summary?: string;
  request: NetworkTraceRequestSummary;
  response: NetworkTraceResponseSummary;
  assertions?: NetworkTraceAssertionResult[];
}): NetworkTraceRecord {
  return {
    traceId: sanitizeTraceId(input.traceId),
    recordedAt: new Date().toISOString(),
    summary: normalizeOptionalText(input.summary),
    request: {
      method: input.request.method.trim().toUpperCase(),
      url: input.request.url,
      headers: cloneStringMap(input.request.headers),
      query: cloneStringMap(input.request.query),
      body: normalizeOptionalText(input.request.body),
    },
    response: {
      status: typeof input.response.status === "number" ? Math.trunc(input.response.status) : undefined,
      statusText: normalizeOptionalText(input.response.statusText),
      headers: cloneStringMap(input.response.headers),
      body: normalizeOptionalText(input.response.body),
      durationMs: typeof input.response.durationMs === "number" && Number.isFinite(input.response.durationMs)
        ? Math.max(0, Math.trunc(input.response.durationMs))
        : undefined,
    },
    assertions: (input.assertions ?? []).map((entry) => ({
      name: entry.name,
      passed: entry.passed === true,
      expected: entry.expected,
      actual: entry.actual,
      message: normalizeOptionalText(entry.message),
    })),
  };
}

export async function writeNetworkTraceRecord(
  stateRootDir: string,
  sessionId: string,
  trace: NetworkTraceRecord,
  requestedPath?: string,
): Promise<NetworkTraceWriteResult> {
  const absolutePath = resolveTracePath(stateRootDir, sessionId, trace.traceId, requestedPath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, JSON.stringify(trace, null, 2), "utf8");
  const relativePath = path.relative(path.resolve(stateRootDir), absolutePath) || path.basename(absolutePath);
  return {
    absolutePath,
    relativePath,
  };
}

function resolveTracePath(
  stateRootDir: string,
  sessionId: string,
  traceId: string,
  requestedPath?: string,
): string {
  if (typeof requestedPath === "string" && requestedPath.trim().length > 0) {
    return resolveUserPath(requestedPath, stateRootDir);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${timestamp}-${traceId}.json`;
  return path.join(getProjectStatePaths(stateRootDir).toolResultsDir, sessionId, "network-traces", filename);
}

function sanitizeTraceId(traceId: string | undefined): string {
  const raw = normalizeOptionalText(traceId) ?? "trace";
  const normalized = raw.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return normalized.length > 0 ? normalized : "trace";
}

function cloneStringMap(value: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!value) {
    return undefined;
  }
  const next = { ...value };
  return Object.keys(next).length > 0 ? next : undefined;
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
