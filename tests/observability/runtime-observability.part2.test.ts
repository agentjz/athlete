import assert from "node:assert/strict";
import fsSync from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { runManagedAgentTurn } from "../../src/agent/turn.js";
import { createMessage } from "../../src/agent/session.js";
import { buildSessionRuntimeSummary } from "../../src/agent/runtimeMetrics.js";
import { createProviderRecoveryTransition } from "../../src/agent/runtimeTransition.js";
import { SessionStore } from "../../src/agent/session.js";
import { persistRecoveryTurn } from "../../src/agent/turn.js";
import type { FunctionToolDefinition, ToolRegistry } from "../../src/tools/index.js";
import { handleLocalCommand } from "../../src/ui/localCommands.js";
import type { ToolExecutionResult } from "../../src/types.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";

const LARGE_MARKER = "ROUND3-RUNTIME::" + "R".repeat(24_000);
const RUNTIME_TEST_IDENTITY = {
  kind: "teammate" as const,
  name: "runtime-test",
  role: "runtime_metrics_verifier",
  teamName: "tests",
};







interface FakeResponse {
  kind: "text" | "tool";
  content?: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
}

function createRuntimeToolRegistry(): ToolRegistry {
  return {
    definitions: [createFunctionTool("emit_large_runtime_pack")],
    async execute(name) {
      await sleep(15);
      if (name !== "emit_large_runtime_pack") {
        throw new Error(`Unexpected tool: ${name}`);
      }
      return okResult(JSON.stringify({
        ok: true,
        path: "validation/round3-runtime-pack.json",
        format: "json",
        content: LARGE_MARKER,
        preview: `${LARGE_MARKER.slice(0, 160)}...`,
        entries: Array.from({ length: 80 }, (_, index) => ({
          path: `reports/chunk-${index}.md`,
          type: "file",
        })),
      }, null, 2));
    },
  };
}

function createFunctionTool(name: string): FunctionToolDefinition {
  return {
    type: "function",
    function: {
      name,
      description: `${name} test tool`,
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  };
}

function okResult(output: string, metadata?: ToolExecutionResult["metadata"]): ToolExecutionResult {
  return { ok: true, output, metadata };
}

function textResponse(content: string): FakeResponse {
  return { kind: "text", content };
}

function toolCallsResponse(toolCalls: NonNullable<FakeResponse["toolCalls"]>): FakeResponse {
  return { kind: "tool", toolCalls };
}

async function startFakeOpenAiServer(
  respond: (payload: { messages?: Array<{ role?: string; content?: unknown }> }) => Promise<FakeResponse>,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/chat/completions") {
      response.writeHead(404).end();
      return;
    }

    const body = JSON.parse(await readRequestBody(request)) as { messages?: Array<{ role?: string; content?: unknown }> };
    const next = await respond(body);
    response.writeHead(200, { "Content-Type": "text/event-stream", Connection: "keep-alive", "Cache-Control": "no-cache" });
    response.write(`data: ${JSON.stringify(next.kind === "tool"
      ? { choices: [{ delta: { tool_calls: (next.toolCalls ?? []).map((toolCall, index) => ({ index, id: `tool-${index}`, function: { name: toolCall.name, arguments: JSON.stringify(toolCall.args) } })) } }] }
      : { choices: [{ delta: { content: next.content } }] })}\n\n`);
    response.end("data: [DONE]\n\n");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start fake OpenAI server.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function readRequestBody(request: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function captureStdout(run: () => Promise<void>): Promise<string> {
  const writes: string[] = [];
  const original = fsSync.writeSync;
  (fsSync as typeof fsSync & { writeSync: typeof fsSync.writeSync }).writeSync = ((fd, buffer, ...rest) => {
    writes.push(String(buffer));
    return typeof buffer === "string" ? buffer.length : Buffer.byteLength(String(buffer));
  }) as typeof fsSync.writeSync;

  try {
    await run();
    return writes.join("");
  } finally {
    (fsSync as typeof fsSync & { writeSync: typeof fsSync.writeSync }).writeSync = original;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

test("runtime observability explains provider and managed budget pause reasons with structured budget fields", () => {
  const providerPaused = buildSessionRuntimeSummary({
    runtimeStats: {
      version: 1,
      model: {
        requestCount: 3,
        waitDurationMsTotal: 600,
        usage: {
          requestsWithUsage: 0,
          requestsWithoutUsage: 3,
          inputTokensTotal: 0,
          outputTokensTotal: 0,
          totalTokensTotal: 0,
          reasoningTokensTotal: 0,
        },
      },
      tools: {
        callCount: 0,
        durationMsTotal: 0,
        byName: {},
      },
      events: {
        continuationCount: 0,
        yieldCount: 0,
        recoveryCount: 2,
        compressionCount: 0,
      },
      externalizedToolResults: {
        count: 0,
        byteLengthTotal: 0,
      },
      updatedAt: new Date().toISOString(),
    },
    checkpoint: {
      version: 1,
      objective: "provider recovery budget test",
      status: "active",
      completedSteps: [],
      flow: {
        phase: "recovery",
        reason: "pause.provider_recovery_budget_exhausted",
        lastTransition: {
          action: "pause",
          reason: {
            code: "pause.provider_recovery_budget_exhausted",
            pauseReason: "Provider recovery budget exhausted.",
            attemptsUsed: 7,
            maxAttempts: 6,
            elapsedMs: 130_000,
            maxElapsedMs: 120_000,
            lastError: "socket hang up",
          },
          timestamp: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      },
      priorityArtifacts: [],
      updatedAt: new Date().toISOString(),
    },
  } as any);

  assert.equal(providerPaused.durableTruth.checkpoint.lastTransition?.reason.code, "pause.provider_recovery_budget_exhausted");
  assert.equal(providerPaused.derivedDiagnostics.controlFlow.whyContinue.reasonCode, undefined);
  assert.equal(providerPaused.derivedDiagnostics.controlFlow.whyRecovery.reasonCode, undefined);

  const managedPaused = buildSessionRuntimeSummary({
    runtimeStats: {
      version: 1,
      model: {
        requestCount: 1,
        waitDurationMsTotal: 200,
        usage: {
          requestsWithUsage: 0,
          requestsWithoutUsage: 1,
          inputTokensTotal: 0,
          outputTokensTotal: 0,
          totalTokensTotal: 0,
          reasoningTokensTotal: 0,
        },
      },
      tools: {
        callCount: 1,
        durationMsTotal: 50,
        byName: {},
      },
      events: {
        continuationCount: 1,
        yieldCount: 1,
        recoveryCount: 0,
        compressionCount: 0,
      },
      externalizedToolResults: {
        count: 0,
        byteLengthTotal: 0,
      },
      updatedAt: new Date().toISOString(),
    },
    checkpoint: {
      version: 1,
      objective: "managed slice budget test",
      status: "active",
      completedSteps: [],
      flow: {
        phase: "continuation",
        reason: "pause.managed_slice_budget_exhausted",
        lastTransition: {
          action: "pause",
          reason: {
            code: "pause.managed_slice_budget_exhausted",
            pauseReason: "Managed continuation paused.",
            slicesUsed: 8,
            maxSlices: 8,
            elapsedMs: 190_000,
            maxElapsedMs: 180_000,
          },
          timestamp: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      },
      priorityArtifacts: [],
      updatedAt: new Date().toISOString(),
    },
  } as any);

  assert.equal(managedPaused.durableTruth.checkpoint.lastTransition?.reason.code, "pause.managed_slice_budget_exhausted");
  assert.equal(managedPaused.derivedDiagnostics.controlFlow.whyContinue.reasonCode, undefined);
  assert.equal(managedPaused.derivedDiagnostics.controlFlow.whyRecovery.reasonCode, undefined);
});

test("runtime observability local command prints a product-style summary that explains wait state and recent activity", async () => {
  const output = await captureStdout(async () => {
    const result = await handleLocalCommand("/runtime", {
      cwd: process.cwd(),
      session: {
        id: "runtime-session",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        cwd: process.cwd(),
        messageCount: 0,
        messages: [],
        todoItems: [],
        runtimeStats: {
          version: 1,
          model: {
            requestCount: 3,
            waitDurationMsTotal: 1_240,
            usage: {
              requestsWithUsage: 0,
              requestsWithoutUsage: 3,
              inputTokensTotal: 0,
              outputTokensTotal: 0,
              totalTokensTotal: 0,
              reasoningTokensTotal: 0,
            },
          },
          tools: {
            callCount: 2,
            durationMsTotal: 220,
            byName: {
              read_file: {
                callCount: 2,
                durationMsTotal: 220,
                okCount: 2,
                errorCount: 0,
              },
            },
          },
          events: {
            continuationCount: 1,
            yieldCount: 1,
            recoveryCount: 0,
            compressionCount: 2,
          },
          externalizedToolResults: {
            count: 1,
            byteLengthTotal: 24_000,
          },
          updatedAt: new Date().toISOString(),
        },
        checkpoint: {
          version: 1,
          objective: "Finish the runtime dashboard.",
          status: "active",
          completedSteps: ["Collected runtime stats"],
          flow: {
            phase: "active",
            reason: "continue.verification_required",
            lastTransition: {
              action: "continue",
              reason: {
                code: "continue.verification_required",
                pendingPaths: ["src/ui/runtimeSummary.ts"],
                attempts: 1,
                reminderCount: 1,
              },
              timestamp: new Date().toISOString(),
            },
            updatedAt: new Date().toISOString(),
          },
          priorityArtifacts: [],
          updatedAt: new Date().toISOString(),
        },
        verificationState: {
          status: "required",
          attempts: 1,
          reminderCount: 1,
          noProgressCount: 0,
          maxAttempts: 3,
          maxNoProgress: 2,
          maxReminders: 3,
          pendingPaths: ["src/ui/runtimeSummary.ts"],
          updatedAt: new Date().toISOString(),
        },
      } as any,
      config: {
        model: "deepseek-v4-flash",
        mode: "agent",
        baseUrl: "https://api.deepseek.com",
        contextWindowMessages: 16,
        maxContextChars: 8_500,
        contextSummaryChars: 1_200,
      } as any,
    });

    assert.equal(result, "handled");
  });

  assert.match(output, /current runtime/i);
  assert.match(output, /waiting on: verification/i);
  assert.match(output, /recent activity:/i);
  assert.match(output, /model requests/i);
  assert.match(output, /tool calls/i);
  assert.match(output, /usage: unavailable/i);
  assert.match(output, /verification required/i);
  assert.match(output, /prompt hotspot/i);
  assert.match(output, /externalized results/i);
  assert.doesNotMatch(output, /durable truth/i);
  assert.doesNotMatch(output, /derived diagnostics/i);
});
