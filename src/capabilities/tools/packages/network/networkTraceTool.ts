import { ToolExecutionError } from "../../core/errors.js";
import { okResult, parseArgs } from "../../core/shared.js";
import type { RegisteredTool } from "../../core/types.js";
import { normalizeOptionalText, normalizeStringMap } from "./httpRequestRuntime.js";
import { createNetworkTraceRecord, writeNetworkTraceRecord } from "./networkTrace.js";

export const networkTraceTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "network_trace",
      description: "Persist structured HTTP request/response evidence for review and acceptance closeout.",
      parameters: {
        type: "object",
        properties: {
          trace_id: {
            type: "string",
            description: "Optional trace id. Defaults to a sanitized generated label.",
          },
          path: {
            type: "string",
            description: "Optional output path. Relative paths are resolved from project state root.",
          },
          summary: {
            type: "string",
            description: "Optional short summary describing what the trace proves.",
          },
          request: {
            type: "object",
            properties: {
              method: { type: "string" },
              url: { type: "string" },
              headers: {
                type: "object",
                additionalProperties: {
                  type: "string",
                },
              },
              query: {
                type: "object",
                additionalProperties: {
                  type: "string",
                },
              },
              body: {
                type: "string",
              },
            },
            required: ["method", "url"],
            additionalProperties: false,
          },
          response: {
            type: "object",
            properties: {
              status: { type: "number" },
              status_text: { type: "string" },
              headers: {
                type: "object",
                additionalProperties: {
                  type: "string",
                },
              },
              body: {
                type: "string",
              },
              duration_ms: {
                type: "number",
              },
            },
            additionalProperties: false,
          },
          assertions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                passed: { type: "boolean" },
                expected: {},
                actual: {},
                message: { type: "string" },
              },
              required: ["name", "passed"],
              additionalProperties: false,
            },
          },
        },
        required: ["request"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const request = readTraceRequest(args.request);
    const response = readTraceResponse(args.response);
    const assertions = readTraceAssertions(args.assertions);

    const trace = createNetworkTraceRecord({
      traceId: normalizeOptionalText(args.trace_id),
      summary: normalizeOptionalText(args.summary),
      request,
      response,
      assertions,
    });
    const written = await writeNetworkTraceRecord(
      context.projectContext.stateRootDir,
      context.sessionId,
      trace,
      normalizeOptionalText(args.path),
    );

    return okResult(
      JSON.stringify(
        {
          ok: true,
          trace_id: trace.traceId,
          recorded_at: trace.recordedAt,
          path: written.relativePath,
          summary: trace.summary,
          request: trace.request,
          response: trace.response,
          assertions: trace.assertions,
          signals: [
            {
              kind: "structured_artifact_valid",
              path: written.relativePath,
              format: "json",
            },
          ],
        },
        null,
        2,
      ),
      {
        changedPaths: [written.relativePath],
      },
    );
  },
};

function readTraceRequest(value: unknown): {
  method: string;
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ToolExecutionError("Tool argument \"request\" must be an object.", {
      code: "NETWORK_TRACE_ARGUMENT_INVALID",
      details: {
        field: "request",
      },
    });
  }
  const record = value as Record<string, unknown>;
  const method = normalizeOptionalText(record.method);
  const url = normalizeOptionalText(record.url);
  if (!method || !url) {
    throw new ToolExecutionError("network_trace.request requires method and url.", {
      code: "NETWORK_TRACE_ARGUMENT_INVALID",
      details: {
        field: "request",
      },
    });
  }

  return {
    method,
    url,
    headers: normalizeStringMap(record.headers, "request.headers"),
    query: normalizeStringMap(record.query, "request.query"),
    body: normalizeOptionalText(record.body),
  };
}

function readTraceResponse(value: unknown): {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string;
  durationMs?: number;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  return {
    status: typeof record.status === "number" && Number.isFinite(record.status)
      ? Math.trunc(record.status)
      : undefined,
    statusText: normalizeOptionalText(record.status_text),
    headers: normalizeStringMap(record.headers, "response.headers"),
    body: normalizeOptionalText(record.body),
    durationMs: typeof record.duration_ms === "number" && Number.isFinite(record.duration_ms)
      ? Math.max(0, Math.trunc(record.duration_ms))
      : undefined,
  };
}

function readTraceAssertions(value: unknown): Array<{
  name: string;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
  message?: string;
}> {
  if (!Array.isArray(value)) {
    return [];
  }
  const parsed: Array<{
    name: string;
    passed: boolean;
    expected?: unknown;
    actual?: unknown;
    message?: string;
  }> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const name = normalizeOptionalText(record.name);
    if (!name) {
      continue;
    }
    parsed.push({
      name,
      passed: record.passed === true,
      expected: record.expected,
      actual: record.actual,
      message: normalizeOptionalText(record.message),
    });
  }
  return parsed;
}
