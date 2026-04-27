import path from "node:path";

import { ToolExecutionError } from "../../core/errors.js";
import { okResult, parseArgs } from "../../core/shared.js";
import type { RegisteredTool } from "../../core/types.js";
import { executeHttpRequest, normalizeOptionalText } from "./httpRequestRuntime.js";
import { createNetworkTraceRecord, writeNetworkTraceRecord } from "./networkTrace.js";

interface SuiteStepDefinition {
  id: string;
  request: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    query?: Record<string, string>;
    body?: unknown;
    timeoutMs?: number;
    sessionId?: string;
  };
  assertions: {
    status?: number;
    bodyContains: string[];
  };
}

export const httpSuiteTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "http_suite",
      description: "Execute a JSON step suite of HTTP calls with structured assertions and failure reasons.",
      parameters: {
        type: "object",
        properties: {
          session_id: {
            type: "string",
            description: "Optional default session id for all steps.",
          },
          stop_on_failure: {
            type: "boolean",
            description: "When true, stop at first failed assertion. Defaults to true.",
          },
          trace: {
            type: "object",
            description: "Optional suite trace settings.",
            properties: {
              enabled: { type: "boolean" },
              path: { type: "string" },
            },
            additionalProperties: false,
          },
          steps: {
            type: "array",
            description: "Ordered suite steps in JSON DSL.",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                request: {
                  type: "object",
                  properties: {
                    url: { type: "string" },
                    method: { type: "string" },
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
                    body: {},
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
                    body_contains: {
                      type: "array",
                      items: {
                        type: "string",
                      },
                    },
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
    const defaultSessionId = normalizeOptionalText(args.session_id);
    const stopOnFailure = args.stop_on_failure !== false;
    const traceEnabled = isSuiteTraceEnabled(args.trace);
    const tracePath = readSuiteTracePath(args.trace);
    const steps = readSuiteSteps(args.steps);

    const stepResults: Array<Record<string, unknown>> = [];
    const failedSteps: Array<Record<string, unknown>> = [];
    let stoppedEarly = false;

    for (const step of steps) {
      const requestResult = await executeHttpRequest(
        {
          url: step.request.url,
          method: step.request.method,
          headers: step.request.headers,
          query: step.request.query,
          body: step.request.body,
          timeoutMs: step.request.timeoutMs,
          sessionId: step.request.sessionId ?? defaultSessionId,
          expectStatus: step.assertions.status,
          bodyContains: step.assertions.bodyContains,
        },
        {
          stateRootDir: context.projectContext.stateRootDir,
          abortSignal: context.abortSignal,
        },
      );

      const reason = buildFailureReason(requestResult);
      const writtenTracePath = traceEnabled
        ? await writeSuiteStepTrace(context.projectContext.stateRootDir, context.sessionId, tracePath, step.id, requestResult)
        : undefined;

      stepResults.push({
        id: step.id,
        ok: requestResult.ok,
        method: requestResult.method,
        url: requestResult.url,
        status: requestResult.status,
        duration_ms: requestResult.durationMs,
        body: requestResult.bodyPreview,
        assertions: requestResult.assertions,
        trace_path: writtenTracePath,
      });

      if (!requestResult.ok) {
        failedSteps.push({
          id: step.id,
          reason,
          status: requestResult.status,
          missing_body_contains: requestResult.assertions.bodyContains.missing,
        });
        if (stopOnFailure) {
          stoppedEarly = true;
          break;
        }
      }
    }

    const succeeded = failedSteps.length === 0;
    const output = {
      ok: succeeded,
      total_steps: steps.length,
      executed_steps: stepResults.length,
      stopped_early: stoppedEarly,
      session_id: defaultSessionId,
      steps: stepResults,
      failed_steps: failedSteps,
      signals: stepResults
        .filter((step) => step.ok === true)
        .map((step) => ({
          kind: "http_endpoint_verified",
          url: step.url,
          status: step.status,
        })),
    };

    return okResult(
      JSON.stringify(output, null, 2),
      {
        verification: {
          attempted: true,
          command: `http_suite (${stepResults.length} steps)`,
          exitCode: succeeded ? 0 : 1,
          kind: "http_suite",
          passed: succeeded,
        },
      },
    );
  },
};

function isSuiteTraceEnabled(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.enabled === true;
}

function readSuiteTracePath(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return normalizeOptionalText((value as Record<string, unknown>).path);
}

function readSuiteSteps(value: unknown): SuiteStepDefinition[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ToolExecutionError("http_suite requires non-empty steps array.", {
      code: "HTTP_SUITE_STEPS_INVALID",
    });
  }

  return value.map((entry, index) => readStep(entry, index));
}

function readStep(value: unknown, index: number): SuiteStepDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ToolExecutionError(`http_suite step ${index + 1} must be an object.`, {
      code: "HTTP_SUITE_STEP_INVALID",
      details: { index },
    });
  }
  const record = value as Record<string, unknown>;
  const request = record.request;
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new ToolExecutionError(`http_suite step ${index + 1} requires request object.`, {
      code: "HTTP_SUITE_STEP_INVALID",
      details: { index },
    });
  }
  const requestRecord = request as Record<string, unknown>;
  const url = normalizeOptionalText(requestRecord.url);
  if (!url) {
    throw new ToolExecutionError(`http_suite step ${index + 1} requires request.url.`, {
      code: "HTTP_SUITE_STEP_INVALID",
      details: { index },
    });
  }

  const assertions = record.assertions && typeof record.assertions === "object" && !Array.isArray(record.assertions)
    ? (record.assertions as Record<string, unknown>)
    : {};

  return {
    id: normalizeOptionalText(record.id) ?? `step-${index + 1}`,
    request: {
      url,
      method: normalizeOptionalText(requestRecord.method),
      headers: requestRecord.headers as Record<string, string> | undefined,
      query: requestRecord.query as Record<string, string> | undefined,
      body: requestRecord.body,
      timeoutMs: typeof requestRecord.timeout_ms === "number" ? requestRecord.timeout_ms : undefined,
      sessionId: normalizeOptionalText(requestRecord.session_id),
    },
    assertions: {
      status: typeof assertions.status === "number" ? Math.trunc(assertions.status) : undefined,
      bodyContains: Array.isArray(assertions.body_contains)
        ? assertions.body_contains.map((entry) => String(entry ?? ""))
        : [],
    },
  };
}

function buildFailureReason(result: Awaited<ReturnType<typeof executeHttpRequest>>): string {
  const reasons: string[] = [];
  if (!result.assertions.status.passed) {
    reasons.push(`status expected ${result.assertions.status.expected}, got ${result.assertions.status.actual}`);
  }
  if (!result.assertions.bodyContains.passed) {
    reasons.push(`body_contains missing: ${result.assertions.bodyContains.missing.join(", ")}`);
  }
  return reasons.join("; ");
}

async function writeSuiteStepTrace(
  stateRootDir: string,
  sessionId: string,
  requestedPath: string | undefined,
  stepId: string,
  requestResult: Awaited<ReturnType<typeof executeHttpRequest>>,
): Promise<string> {
  const trace = createNetworkTraceRecord({
    traceId: stepId,
    request: {
      method: requestResult.method,
      url: requestResult.url,
      headers: requestResult.request.headers,
      query: requestResult.request.query,
      body: requestResult.request.body,
    },
    response: {
      status: requestResult.status,
      statusText: requestResult.statusText,
      headers: requestResult.headers,
      body: requestResult.bodyPreview,
      durationMs: requestResult.durationMs,
    },
    assertions: [
      {
        name: "status",
        passed: requestResult.assertions.status.passed,
        expected: requestResult.assertions.status.expected,
        actual: requestResult.assertions.status.actual,
      },
      {
        name: "body_contains",
        passed: requestResult.assertions.bodyContains.passed,
        expected: requestResult.bodyContains,
        actual: requestResult.assertions.bodyContains.missing,
      },
    ],
  });

  const traceFilePath = requestedPath
    ? path.join(requestedPath, `${stepId}.json`)
    : undefined;
  const written = await writeNetworkTraceRecord(stateRootDir, sessionId, trace, traceFilePath);
  return written.relativePath;
}
