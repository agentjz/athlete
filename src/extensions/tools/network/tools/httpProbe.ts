import { clampNumber, parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { jsonResult } from "../../../shared.js";
import { fetchWithTimeout, responseHeaders } from "../httpRuntime.js";
import { truncateText } from "../../../../utils/fs.js";

export const httpProbeTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "http_probe",
      description: "Probe one HTTP endpoint and return response facts.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
          method: { type: "string" },
          expect_status: { type: "number" },
          body_contains: { type: "array", items: { type: "string" } },
          timeout_ms: { type: "number" },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const method = typeof args.method === "string" ? args.method.toUpperCase() : "GET";
    const startedAt = Date.now();
    const response = await fetchWithTimeout(
      readString(args.url, "url"),
      { method },
      clampNumber(args.timeout_ms, 500, 120_000, 10_000),
      context.abortSignal,
    );
    const body = method === "HEAD" ? "" : await response.text();
    const expectedStatus = typeof args.expect_status === "number" ? Math.trunc(args.expect_status) : undefined;
    const bodyContains = Array.isArray(args.body_contains) ? args.body_contains.map(String) : [];
    const missing = bodyContains.filter((fragment) => !body.includes(fragment));
    const statusPassed = typeof expectedStatus === "number" ? response.status === expectedStatus : response.ok;
    return jsonResult({
      ok: statusPassed && missing.length === 0,
      method,
      url: response.url,
      status: response.status,
      statusText: response.statusText,
      durationMs: Date.now() - startedAt,
      headers: responseHeaders(response),
      body: truncateText(body, 4_000),
      assertions: {
        status: { passed: statusPassed, expected: expectedStatus, actual: response.status },
        bodyContains: { passed: missing.length === 0, missing },
      },
    });
  },
};
