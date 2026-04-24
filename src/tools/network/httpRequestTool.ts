import { okResult, parseArgs } from "../shared.js";
import type { RegisteredTool } from "../types.js";
import { createNetworkTraceRecord, writeNetworkTraceRecord } from "./networkTrace.js";
import { executeHttpRequest, normalizeOptionalText } from "./httpRequestRuntime.js";

export const httpRequestTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "http_request",
      description: "Execute one HTTP request with optional session reuse, assertions, and trace capture.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Absolute URL, or a relative path when session_id provides base_url.",
          },
          method: {
            type: "string",
            description: "HTTP method. Defaults to GET.",
          },
          session_id: {
            type: "string",
            description: "Optional session id from http_session for base_url, headers, query, token, and cookies.",
          },
          headers: {
            type: "object",
            description: "Optional request headers.",
            additionalProperties: {
              type: "string",
            },
          },
          query: {
            type: "object",
            description: "Optional query parameters.",
            additionalProperties: {
              type: "string",
            },
          },
          body: {
            description: "Optional request body. Non-string values are serialized as JSON.",
          },
          timeout_ms: {
            type: "number",
            description: "Optional timeout in milliseconds.",
          },
          expect_status: {
            type: "number",
            description: "Optional expected status code. If omitted, 2xx/3xx responses pass by default.",
          },
          body_contains: {
            type: "array",
            description: "Optional substrings that must appear in response body.",
            items: {
              type: "string",
            },
          },
          trace: {
            type: "object",
            description: "Optional trace write settings for evidence capture.",
            properties: {
              enabled: {
                type: "boolean",
              },
              path: {
                type: "string",
              },
              trace_id: {
                type: "string",
              },
              summary: {
                type: "string",
              },
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
    const result = await executeHttpRequest(
      {
        url: String(args.url ?? ""),
        method: normalizeOptionalText(args.method),
        sessionId: normalizeOptionalText(args.session_id),
        headers: args.headers as Record<string, string> | undefined,
        query: args.query as Record<string, string> | undefined,
        body: args.body,
        timeoutMs: typeof args.timeout_ms === "number" ? args.timeout_ms : undefined,
        expectStatus: typeof args.expect_status === "number" ? args.expect_status : undefined,
        bodyContains: Array.isArray(args.body_contains)
          ? args.body_contains.map((entry) => String(entry ?? ""))
          : undefined,
      },
      {
        stateRootDir: context.projectContext.stateRootDir,
        abortSignal: context.abortSignal,
      },
    );

    const traceSettings = readTraceSettings(args.trace);
    const tracePath = traceSettings.enabled
      ? await writeRequestTrace(context, result, traceSettings.path, traceSettings.traceId, traceSettings.summary)
      : undefined;
    const output = {
      ok: result.ok,
      method: result.method,
      url: result.url,
      status: result.status,
      status_text: result.statusText,
      duration_ms: result.durationMs,
      headers: result.headers,
      body: result.bodyPreview,
      body_truncated: result.bodyTruncated,
      expected_status: result.expectedStatus,
      body_contains: result.bodyContains,
      assertions: result.assertions,
      session_id: result.sessionId,
      trace_path: tracePath,
      signals: result.ok
        ? [
            {
              kind: "http_endpoint_verified",
              url: result.url,
              status: result.status,
              body: result.bodyPreview,
            },
          ]
        : [],
    };

    return okResult(
      JSON.stringify(output, null, 2),
      {
        verification: {
          attempted: true,
          command: `${result.method} ${result.url}`,
          exitCode: result.status,
          kind: "http_request",
          passed: result.ok,
        },
      },
    );
  },
};

async function writeRequestTrace(
  context: Parameters<RegisteredTool["execute"]>[1],
  result: Awaited<ReturnType<typeof executeHttpRequest>>,
  requestedPath?: string,
  traceId?: string,
  summary?: string,
): Promise<string> {
  const trace = createNetworkTraceRecord({
    traceId,
    summary,
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
    assertions: [
      {
        name: "status",
        passed: result.assertions.status.passed,
        expected: result.assertions.status.expected,
        actual: result.assertions.status.actual,
      },
      {
        name: "body_contains",
        passed: result.assertions.bodyContains.passed,
        expected: result.bodyContains,
        actual: result.assertions.bodyContains.missing,
      },
    ],
  });
  const written = await writeNetworkTraceRecord(
    context.projectContext.stateRootDir,
    context.sessionId,
    trace,
    requestedPath,
  );
  return written.relativePath;
}

function readTraceSettings(value: unknown): {
  enabled: boolean;
  path?: string;
  traceId?: string;
  summary?: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { enabled: false };
  }

  const record = value as Record<string, unknown>;
  return {
    enabled: record.enabled !== false,
    path: normalizeOptionalText(record.path),
    traceId: normalizeOptionalText(record.trace_id),
    summary: normalizeOptionalText(record.summary),
  };
}
