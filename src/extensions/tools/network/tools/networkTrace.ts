import { ToolExecutionError } from "../../../../tools/core/errors.js";
import { parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { changedJsonResult, sanitizeStateSegment } from "../../../shared.js";
import { writeNetworkTrace } from "../traceStore.js";

export const networkTraceTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "network_trace",
      description: "Persist structured network evidence as JSON.",
      parameters: {
        type: "object",
        properties: {
          trace_id: { type: "string" },
          summary: { type: "string" },
          request: { type: "object" },
          response: { type: "object" },
          assertions: { type: "array" },
        },
        required: ["trace_id", "request"],
        additionalProperties: false,
      },
    },
  },
  changeSignal: "required",
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const traceId = sanitizeStateSegment(readString(args.trace_id, "trace_id"));
    const request = readTraceRequest(args.request);
    const record = {
      traceId,
      recordedAt: new Date().toISOString(),
      summary: typeof args.summary === "string" ? args.summary : undefined,
      request,
      response: readTraceResponse(args.response),
      assertions: readTraceAssertions(args.assertions),
    };
    const filePath = await writeNetworkTrace(context.projectContext.stateRootDir, traceId, record);
    return changedJsonResult({ ok: true, path: filePath, traceId }, [filePath]);
  },
};

function readTraceRequest(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ToolExecutionError("network_trace request must be an object.", {
      code: "NETWORK_TRACE_REQUEST_INVALID",
    });
  }
  const record = value as Record<string, unknown>;
  if (typeof record.method !== "string" || record.method.trim().length === 0) {
    throw new ToolExecutionError("network_trace request.method is required.", {
      code: "NETWORK_TRACE_REQUEST_INVALID",
    });
  }
  if (typeof record.url !== "string" || record.url.trim().length === 0) {
    throw new ToolExecutionError("network_trace request.url is required.", {
      code: "NETWORK_TRACE_REQUEST_INVALID",
    });
  }
  return {
    method: record.method.toUpperCase(),
    url: record.url,
    headers: readStringMap(record.headers),
    query: readStringMap(record.query),
    body: typeof record.body === "string" ? record.body : undefined,
  };
}

function readTraceResponse(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  return {
    status: typeof record.status === "number" && Number.isFinite(record.status) ? Math.trunc(record.status) : undefined,
    statusText: typeof record.status_text === "string" ? record.status_text : undefined,
    headers: readStringMap(record.headers),
    body: typeof record.body === "string" ? record.body : undefined,
    durationMs: typeof record.duration_ms === "number" && Number.isFinite(record.duration_ms)
      ? Math.max(0, Math.trunc(record.duration_ms))
      : undefined,
  };
}

function readTraceAssertions(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.name !== "string" || record.name.trim().length === 0) {
      return [];
    }
    return [{
      name: record.name,
      passed: record.passed === true,
      expected: record.expected,
      actual: record.actual,
      message: typeof record.message === "string" ? record.message : undefined,
    }];
  });
}

function readStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item != null)
      .map(([key, item]) => [key, String(item)]),
  );
}
