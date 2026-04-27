import { ToolExecutionError } from "../../core/errors.js";
import { okResult, parseArgs } from "../../core/shared.js";
import type { RegisteredTool } from "../../core/types.js";
import {
  collectOpenApiOperations,
  isOpenApiDocument,
  loadOpenApiDocument,
} from "./openapiDocument.js";

interface LintIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
}

export const openapiLintTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "openapi_lint",
      description: "Run a relaxed built-in OpenAPI lint pass and return structured warnings/errors.",
      parameters: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "Local file path or HTTP(S) URL to an OpenAPI JSON document.",
          },
          timeout_ms: {
            type: "number",
            description: "Optional fetch timeout for HTTP sources.",
          },
        },
        required: ["source"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const source = String(args.source ?? "");
    const issues: LintIssue[] = [];
    let resolvedSource: string | undefined;

    try {
      const loaded = await loadOpenApiDocument({
        source,
        cwd: context.cwd,
        timeoutMs: typeof args.timeout_ms === "number" ? args.timeout_ms : undefined,
        abortSignal: context.abortSignal,
      });
      resolvedSource = loaded.resolvedSource;
      issues.push(...lintOpenApi(loaded.document));
    } catch (error) {
      issues.push({
        severity: "error",
        code: error instanceof ToolExecutionError ? error.code : "OPENAPI_LINT_FAILED",
        message: error instanceof Error ? error.message : String(error),
      });
    }

    const errors = issues.filter((issue) => issue.severity === "error");
    const warnings = issues.filter((issue) => issue.severity === "warning");
    const passed = errors.length === 0;

    return okResult(
      JSON.stringify(
        {
          ok: passed,
          source,
          resolved_source: resolvedSource,
          summary: {
            errorCount: errors.length,
            warningCount: warnings.length,
          },
          errors,
          warnings,
        },
        null,
        2,
      ),
      {
        verification: {
          attempted: true,
          command: `openapi_lint ${source}`,
          exitCode: passed ? 0 : 1,
          kind: "openapi_lint",
          passed,
        },
      },
    );
  },
};

function lintOpenApi(document: Record<string, unknown>): LintIssue[] {
  const issues: LintIssue[] = [];
  if (!isOpenApiDocument(document)) {
    issues.push({
      severity: "error",
      code: "OPENAPI_MISSING_VERSION",
      message: "Document is missing openapi/swagger version marker.",
      path: "$",
    });
    return issues;
  }

  const info = readObject(document.info);
  if (!readString(info?.title)) {
    issues.push({
      severity: "warning",
      code: "INFO_TITLE_MISSING",
      message: "info.title is recommended for readable API contracts.",
      path: "$.info.title",
    });
  }
  if (!readString(info?.version)) {
    issues.push({
      severity: "warning",
      code: "INFO_VERSION_MISSING",
      message: "info.version is recommended for traceable API versions.",
      path: "$.info.version",
    });
  }

  const paths = readObject(document.paths);
  if (!paths) {
    issues.push({
      severity: "error",
      code: "PATHS_MISSING",
      message: "paths must be a JSON object.",
      path: "$.paths",
    });
    return issues;
  }

  if (!Array.isArray(document.servers) || document.servers.length === 0) {
    issues.push({
      severity: "warning",
      code: "SERVERS_MISSING",
      message: "servers is empty; callers will need explicit base URL handling.",
      path: "$.servers",
    });
  }

  for (const pathKey of Object.keys(paths)) {
    if (!pathKey.startsWith("/")) {
      issues.push({
        severity: "warning",
        code: "PATH_NOT_ABSOLUTE",
        message: `Path "${pathKey}" should start with '/'.`,
        path: `$.paths.${pathKey}`,
      });
    }
  }

  const operations = collectOpenApiOperations(document);
  const operationIdToPath = new Map<string, string>();
  for (const operation of operations) {
    const operationPath = `$.paths.${operation.path}.${operation.method.toLowerCase()}`;
    const operationNode = readObject(
      readObject(paths[operation.path])?.[operation.method.toLowerCase()],
    );

    if (!operation.operationId) {
      issues.push({
        severity: "warning",
        code: "OPERATION_ID_MISSING",
        message: "operationId is recommended for stable referencing in suites and tests.",
        path: `${operationPath}.operationId`,
      });
    } else {
      const duplicate = operationIdToPath.get(operation.operationId);
      if (duplicate) {
        issues.push({
          severity: "warning",
          code: "OPERATION_ID_DUPLICATE",
          message: `operationId "${operation.operationId}" duplicates ${duplicate}.`,
          path: `${operationPath}.operationId`,
        });
      } else {
        operationIdToPath.set(operation.operationId, operationPath);
      }
    }

    if (!operationNode || !readObject(operationNode.responses)) {
      issues.push({
        severity: "warning",
        code: "RESPONSES_MISSING",
        message: "Operation should declare responses object.",
        path: `${operationPath}.responses`,
      });
    }

    if (!readString(operationNode?.summary) && !readString(operationNode?.description)) {
      issues.push({
        severity: "warning",
        code: "OPERATION_SUMMARY_MISSING",
        message: "Operation should include summary or description.",
        path: `${operationPath}.summary`,
      });
    }
  }

  return issues;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
