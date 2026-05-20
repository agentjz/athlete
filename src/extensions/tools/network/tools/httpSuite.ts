import { parseArgs } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { jsonResult } from "../../../shared.js";
import { executeHttpRequest } from "../httpRuntime.js";

export const httpSuiteTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "http_suite",
      description: "Execute ordered HTTP request steps with assertions.",
      parameters: {
        type: "object",
        properties: {
          session_id: { type: "string" },
          stop_on_failure: { type: "boolean" },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                request: {
                  type: "object",
                  properties: {
                    url: { type: "string" },
                    method: { type: "string" },
                    headers: { type: "object", additionalProperties: { type: "string" } },
                    query: { type: "object", additionalProperties: { type: "string" } },
                    body: { type: "string" },
                    timeout_ms: { type: "number" },
                    session_id: { type: "string" },
                  },
                  required: ["url"],
                  additionalProperties: false,
                },
                assertions: {
                  type: "object",
                  properties: {
                    status: { type: "number" },
                    body_contains: { type: "array", items: { type: "string" } },
                  },
                  additionalProperties: false,
                },
              },
              required: ["request"],
              additionalProperties: false,
            },
          },
        },
        required: ["steps"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const steps = readSteps(args.steps);
    const stopOnFailure = args.stop_on_failure !== false;
    const results = [];
    const failedSteps = [];
    let stoppedEarly = false;
    for (const step of steps) {
      const result = await executeHttpRequest({
        ...step.request,
        session_id: step.request.session_id ?? args.session_id,
        expect_status: step.assertions.status,
        body_contains: step.assertions.body_contains,
      }, context);
      results.push({
        id: step.id,
        ok: result.ok,
        status: result.status,
        url: result.url,
        durationMs: result.durationMs,
        assertions: result.assertions,
      });
      if (!result.ok) {
        failedSteps.push({
          id: step.id,
          status: result.status,
          missingBodyContains: result.assertions.bodyContains.missing,
        });
        if (stopOnFailure) {
          stoppedEarly = true;
          break;
        }
      }
    }
    return jsonResult({
      ok: failedSteps.length === 0,
      totalSteps: steps.length,
      executedSteps: results.length,
      stoppedEarly,
      steps: results,
      failedSteps,
    });
  },
};

function readSteps(value: unknown): Array<{
  id: string;
  request: Record<string, unknown>;
  assertions: Record<string, unknown>;
}> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("http_suite requires non-empty steps.");
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`http_suite step ${index + 1} must be an object.`);
    }
    const record = entry as Record<string, unknown>;
    return {
      id: typeof record.id === "string" ? record.id : `step-${index + 1}`,
      request: readRecord(record.request),
      assertions: readRecord(record.assertions),
    };
  });
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
