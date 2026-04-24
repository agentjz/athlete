import { okResult, parseArgs } from "../shared.js";
import type { RegisteredTool } from "../types.js";
import {
  collectOpenApiOperations,
  isOpenApiDocument,
  loadOpenApiDocument,
} from "./openapiDocument.js";

export const openapiInspectTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "openapi_inspect",
      description: "Load an OpenAPI document (JSON) and summarize executable entrypoints.",
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
          operations_limit: {
            type: "number",
            description: "Maximum number of operation summaries to return.",
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
    const loaded = await loadOpenApiDocument({
      source,
      cwd: context.cwd,
      timeoutMs: typeof args.timeout_ms === "number" ? args.timeout_ms : undefined,
      abortSignal: context.abortSignal,
    });
    const operations = collectOpenApiOperations(loaded.document);
    const limit = normalizeLimit(args.operations_limit);
    const info = readObject(loaded.document.info);
    const servers = Array.isArray(loaded.document.servers)
      ? loaded.document.servers
          .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
          .map((entry) => (entry as Record<string, unknown>).url)
          .filter((value) => typeof value === "string")
      : [];

    const output = {
      ok: true,
      source: loaded.source,
      resolved_source: loaded.resolvedSource,
      version: readString(loaded.document.openapi) ?? readString(loaded.document.swagger),
      title: readString(info?.title),
      description: readString(info?.description),
      paths_count: countPaths(loaded.document.paths),
      operations_count: operations.length,
      operations: operations.slice(0, limit),
      server_urls: servers,
      valid_openapi_shape: isOpenApiDocument(loaded.document),
    };

    return okResult(
      JSON.stringify(output, null, 2),
      {
        verification: {
          attempted: true,
          command: `openapi_inspect ${loaded.source}`,
          exitCode: output.valid_openapi_shape ? 0 : 1,
          kind: "openapi_inspect",
          passed: output.valid_openapi_shape,
        },
      },
    );
  },
};

function normalizeLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 50;
  }
  return Math.max(1, Math.min(200, Math.trunc(value)));
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

function countPaths(value: unknown): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return 0;
  }
  return Object.keys(value).length;
}
