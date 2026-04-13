import { ToolExecutionError } from "../errors.js";
import { clampNumber, okResult, parseArgs, readString } from "../shared.js";
import type { RegisteredTool } from "../types.js";

export const httpProbeTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "http_probe",
      description: "Probe an HTTP endpoint, assert status/body expectations, and return a readable response preview.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "HTTP or HTTPS URL to request.",
          },
          method: {
            type: "string",
            description: "Optional HTTP method. Defaults to GET.",
          },
          expect_status: {
            type: "number",
            description: "Optional expected status code.",
          },
          body_contains: {
            type: "array",
            description: "Optional substrings that must appear in the response body.",
            items: {
              type: "string",
            },
          },
          timeout_ms: {
            type: "number",
            description: "Optional timeout in milliseconds.",
          },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs) {
    const args = parseArgs(rawArgs);
    const url = readString(args.url, "url");
    const method = typeof args.method === "string" && args.method.trim().length > 0 ? args.method.trim().toUpperCase() : "GET";
    const expectStatus = typeof args.expect_status === "number" && Number.isFinite(args.expect_status) ? Math.trunc(args.expect_status) : undefined;
    const bodyContains = Array.isArray(args.body_contains)
      ? args.body_contains.map((value) => String(value ?? "")).filter((value) => value.trim().length > 0)
      : [];
    const timeoutMs = clampNumber(args.timeout_ms, 500, 120_000, 15_000);

    if (!/^https?:\/\//i.test(url)) {
      throw new ToolExecutionError(`http_probe only supports http(s) URLs, got: ${url}`, {
        code: "HTTP_PROBE_PROTOCOL_UNSUPPORTED",
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("http_probe timed out")), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        signal: controller.signal,
      });
      const body = await response.text();
      const bodyPreview = body.length <= 4_000 ? body : `${body.slice(0, 4_000)}...`;
      const statusMatches = typeof expectStatus !== "number" || response.status === expectStatus;
      const bodyMatches = bodyContains.every((needle) => body.includes(needle));
      const passed = response.ok && statusMatches && bodyMatches;

      return okResult(
        JSON.stringify(
          {
            ok: passed,
            url,
            method,
            status: response.status,
            contentType: response.headers.get("content-type") ?? undefined,
            body: bodyPreview,
            expectedStatus: expectStatus,
            bodyContains,
          },
          null,
          2,
        ),
        {
          verification: {
            attempted: true,
            command: `${method} ${url}`,
            exitCode: passed ? 0 : response.status,
            kind: "http_probe",
            passed,
          },
        },
      );
    } catch (error) {
      if (error instanceof ToolExecutionError) {
        throw error;
      }

      throw new ToolExecutionError(
        `http_probe failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
        {
          code: "HTTP_PROBE_FAILED",
          details: {
            url,
          },
        },
      );
    } finally {
      clearTimeout(timer);
    }
  },
};
