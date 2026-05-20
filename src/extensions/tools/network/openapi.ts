import fs from "node:fs/promises";

import { ToolExecutionError } from "../../../tools/core/errors.js";
import type { ToolContext } from "../../../tools/core/types.js";
import { resolveUserPath } from "../../../utils/fs.js";
import { fetchWithTimeout } from "./httpRuntime.js";

export interface OpenApiLoadResult {
  source: string;
  resolvedSource: string;
  document: Record<string, unknown>;
}

export interface OpenApiLintIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
}

export async function loadOpenApiDocument(source: string, context: ToolContext): Promise<OpenApiLoadResult> {
  const normalizedSource = source.trim();
  if (!normalizedSource) {
    throw new ToolExecutionError("OpenAPI source is required.", { code: "OPENAPI_SOURCE_INVALID" });
  }
  const resolvedSource = /^https?:\/\//i.test(normalizedSource)
    ? normalizedSource
    : resolveUserPath(normalizedSource, context.cwd);
  const raw = /^https?:\/\//i.test(normalizedSource)
    ? await (await fetchWithTimeout(normalizedSource, { method: "GET" }, 20_000, context.abortSignal)).text()
    : stripBom(await fs.readFile(resolvedSource, "utf8"));
  const parsed = parseOpenApiDocument(raw, normalizedSource);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ToolExecutionError("OpenAPI document root must be an object.", { code: "OPENAPI_ROOT_INVALID" });
  }
  return {
    source: normalizedSource,
    resolvedSource,
    document: parsed as Record<string, unknown>,
  };
}

export interface OpenApiOperation {
  path: string;
  method: string;
  operationId?: string;
  summary?: string;
}

export function collectOpenApiOperations(document: Record<string, unknown>): OpenApiOperation[] {
  const paths = readRecord(document.paths);
  const operations: OpenApiOperation[] = [];
  for (const [route, item] of Object.entries(paths)) {
    const pathItem = readRecord(item);
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!["get", "put", "post", "delete", "patch", "head", "options"].includes(method.toLowerCase())) {
        continue;
      }
      const record = readRecord(operation);
      operations.push({
        path: route,
        method: method.toUpperCase(),
        operationId: typeof record.operationId === "string" ? record.operationId : undefined,
        summary: typeof record.summary === "string" ? record.summary : undefined,
      });
    }
  }
  return operations;
}

export function lintOpenApiDocument(document: Record<string, unknown>): string[] {
  return lintOpenApiDocumentDetailed(document).map((issue) => issue.message);
}

export function lintOpenApiDocumentDetailed(document: Record<string, unknown>): OpenApiLintIssue[] {
  const findings: OpenApiLintIssue[] = [];
  if (typeof document.openapi !== "string" && typeof document.swagger !== "string") {
    findings.push({
      severity: "error",
      code: "OPENAPI_VERSION_MISSING",
      message: "Missing openapi/swagger version.",
      path: "$",
    });
  }
  if (!document.info || typeof document.info !== "object" || Array.isArray(document.info)) {
    findings.push({
      severity: "error",
      code: "OPENAPI_INFO_MISSING",
      message: "Missing info object.",
      path: "$.info",
    });
  }
  if (!document.paths || typeof document.paths !== "object" || Array.isArray(document.paths)) {
    findings.push({
      severity: "error",
      code: "OPENAPI_PATHS_MISSING",
      message: "Missing paths object.",
      path: "$.paths",
    });
    return findings;
  }

  for (const operation of collectOpenApiOperations(document)) {
    if (!operation.operationId) {
      findings.push({
        severity: "warning",
        code: "OPENAPI_OPERATION_ID_MISSING",
        message: `Missing operationId for ${operation.method} ${operation.path}.`,
        path: `$.paths.${operation.path}.${operation.method.toLowerCase()}.operationId`,
      });
    }
  }
  return findings;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseOpenApiDocument(raw: string, source: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new ToolExecutionError(
      `OpenAPI parse failed for ${source}: ${error instanceof Error ? error.message : String(error)}`,
      { code: "OPENAPI_PARSE_FAILED", details: { source } },
    );
  }
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
