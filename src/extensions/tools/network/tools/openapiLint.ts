import { parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { jsonResult } from "../../../shared.js";
import { lintOpenApiDocumentDetailed, loadOpenApiDocument } from "../openapi.js";

export const openapiLintTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "openapi_lint",
      description: "Lint an OpenAPI JSON document for core structural facts.",
      parameters: {
        type: "object",
        properties: {
          source: { type: "string" },
        },
        required: ["source"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const loaded = await loadOpenApiDocument(readString(args.source, "source"), context);
    const findings = lintOpenApiDocumentDetailed(loaded.document);
    const errors = findings.filter((issue) => issue.severity === "error");
    const warnings = findings.filter((issue) => issue.severity === "warning");
    return jsonResult({
      ok: errors.length === 0,
      source: loaded.source,
      resolvedSource: loaded.resolvedSource,
      summary: {
        errorCount: errors.length,
        warningCount: warnings.length,
      },
      errors,
      warnings,
      findings: findings.map((issue) => issue.message),
    });
  },
};
