import fs from "node:fs/promises";

import { resolveUserPath } from "../../../../utils/fs.js";
import { ToolExecutionError } from "../../core/errors.js";

const DEFAULT_TIMEOUT_MS = 20_000;
const MIN_TIMEOUT_MS = 500;
const MAX_TIMEOUT_MS = 120_000;
const HTTP_METHODS = new Set(["get", "put", "post", "delete", "patch", "head", "options", "trace"]);

export interface OpenApiLoadResult {
  source: string;
  resolvedSource: string;
  document: Record<string, unknown>;
  raw: string;
}

export interface OpenApiOperationSummary {
  path: string;
  method: string;
  operationId?: string;
  summary?: string;
}

export async function loadOpenApiDocument(input: {
  source: string;
  cwd: string;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}): Promise<OpenApiLoadResult> {
  const source = input.source.trim();
  if (!source) {
    throw new ToolExecutionError("Tool argument \"source\" must be a non-empty string.", {
      code: "OPENAPI_SOURCE_INVALID",
    });
  }
  const timeoutMs = normalizeTimeout(input.timeoutMs);

  const raw = isHttpSource(source)
    ? await fetchSourceText(source, timeoutMs, input.abortSignal)
    : await fs.readFile(resolveUserPath(source, input.cwd), "utf8");
  const parsed = parseOpenApiDocument(raw, source);

  return {
    source,
    resolvedSource: isHttpSource(source) ? source : resolveUserPath(source, input.cwd),
    document: parsed,
    raw,
  };
}

export function collectOpenApiOperations(document: Record<string, unknown>): OpenApiOperationSummary[] {
  const pathsRecord = readObject(document.paths);
  if (!pathsRecord) {
    return [];
  }
  const operations: OpenApiOperationSummary[] = [];
  for (const [pathKey, rawPathItem] of Object.entries(pathsRecord)) {
    if (!rawPathItem || typeof rawPathItem !== "object" || Array.isArray(rawPathItem)) {
      continue;
    }
    for (const [method, rawOperation] of Object.entries(rawPathItem)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) {
        continue;
      }
      const operation = readObject(rawOperation);
      operations.push({
        path: pathKey,
        method: method.toUpperCase(),
        operationId: readString(operation?.operationId),
        summary: readString(operation?.summary),
      });
    }
  }
  return operations;
}

export function isOpenApiDocument(document: Record<string, unknown>): boolean {
  return typeof document.openapi === "string" || typeof document.swagger === "string";
}

function parseOpenApiDocument(raw: string, source: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Root must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new ToolExecutionError(
      `openapi parse failed for ${source}: ${error instanceof Error ? error.message : String(error)}`,
      {
        code: "OPENAPI_PARSE_FAILED",
        details: {
          source,
        },
      },
    );
  }
}

async function fetchSourceText(source: string, timeoutMs: number, abortSignal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("openapi source fetch timed out")), timeoutMs);
  abortSignal?.addEventListener("abort", () => controller.abort(abortSignal.reason), { once: true });
  try {
    const response = await fetch(source, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ToolExecutionError(`openapi source fetch failed with status ${response.status}`, {
        code: "OPENAPI_SOURCE_FETCH_FAILED",
        details: {
          source,
          status: response.status,
        },
      });
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeTimeout(timeoutMs: number | undefined): number {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs)) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.trunc(timeoutMs)));
}

function isHttpSource(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
