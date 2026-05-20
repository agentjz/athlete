import { parseArgs } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { changedJsonResult, jsonResult } from "../../../shared.js";
import { executeHttpRequest } from "../httpRuntime.js";
import { writeNetworkTrace } from "../traceStore.js";

export const httpRequestTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "http_request",
      description: "Execute one HTTP request with optional session defaults and assertions.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
          method: { type: "string" },
          session_id: { type: "string" },
          headers: { type: "object", additionalProperties: { type: "string" } },
          query: { type: "object", additionalProperties: { type: "string" } },
          body: {},
          timeout_ms: { type: "number" },
          expect_status: { type: "number" },
          body_contains: { type: "array", items: { type: "string" } },
          trace: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              trace_id: { type: "string" },
              summary: { type: "string" },
            },
            additionalProperties: false,
          },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const result = await executeHttpRequest(args, context);
    const trace = readTraceSettings(args.trace);
    const tracePath = trace.enabled
      ? await writeNetworkTrace(context.projectContext.stateRootDir, trace.traceId, {
          traceId: trace.traceId,
          recordedAt: new Date().toISOString(),
          summary: trace.summary,
          request: {
            method: result.method,
            url: result.url,
            headers: result.request.headers,
            query: result.request.query,
            body: result.request.body,
          },
          response: {
            status: result.status,
            statusText: result.statusText,
            headers: result.headers,
            body: result.bodyPreview,
            durationMs: result.durationMs,
          },
          assertions: result.assertions,
        })
      : undefined;
    const payload = {
      ok: result.ok,
      method: result.method,
      url: result.url,
      status: result.status,
      statusText: result.statusText,
      durationMs: result.durationMs,
      headers: result.headers,
      body: result.bodyPreview,
      bodyTruncated: result.bodyTruncated,
      assertions: result.assertions,
      tracePath,
    };
    return tracePath ? changedJsonResult(payload, [tracePath]) : jsonResult(payload);
  },
};

function readTraceSettings(value: unknown): { enabled: boolean; traceId: string; summary?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { enabled: false, traceId: "" };
  }
  const record = value as Record<string, unknown>;
  const enabled = record.enabled !== false;
  const traceId = typeof record.trace_id === "string" && record.trace_id.trim()
    ? record.trace_id.trim()
    : `http-request-${Date.now()}`;
  return {
    enabled,
    traceId,
    summary: typeof record.summary === "string" ? record.summary : undefined,
  };
}
