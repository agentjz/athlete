import { parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { jsonResult } from "../../../shared.js";
import { collectOpenApiOperations, lintOpenApiDocumentDetailed, loadOpenApiDocument } from "../openapi.js";

export const openapiInspectTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "openapi_inspect",
      description: "Inspect an OpenAPI JSON document and list operations.",
      parameters: {
        type: "object",
        properties: {
          source: { type: "string" },
          operations_limit: { type: "number" },
        },
        required: ["source"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const loaded = await loadOpenApiDocument(readString(args.source, "source"), context);
    const operations = collectOpenApiOperations(loaded.document);
    const limit = typeof args.operations_limit === "number"
      ? Math.max(1, Math.min(200, Math.trunc(args.operations_limit)))
      : 50;
    const findings = lintOpenApiDocumentDetailed(loaded.document);
    return jsonResult({
      ok: findings.filter((issue) => issue.severity === "error").length === 0,
      source: loaded.source,
      resolvedSource: loaded.resolvedSource,
      version: readOptionalString(loaded.document.openapi) ?? readOptionalString(loaded.document.swagger),
      title: readOptionalString(readRecord(loaded.document.info).title),
      pathsCount: Object.keys(readRecord(loaded.document.paths)).length,
      operationsCount: operations.length,
      operations: operations.slice(0, limit),
    });
  },
};

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
