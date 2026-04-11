import assert from "node:assert/strict";
import fsSync from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { runManagedAgentTurn } from "../src/agent/turn.js";
import { createMessage } from "../src/agent/session.js";
import { buildSessionRuntimeSummary } from "../src/agent/runtimeMetrics.js";
import { createProviderRecoveryTransition } from "../src/agent/runtimeTransition.js";
import { SessionStore } from "../src/agent/session.js";
import { persistRecoveryTurn } from "../src/agent/turn.js";
import type { FunctionToolDefinition, ToolRegistry } from "../src/tools/index.js";
import { handleLocalCommand } from "../src/ui/localCommands.js";
import type { ToolExecutionResult } from "../src/types.js";
import { createTempWorkspace, createTestRuntimeConfig } from "./helpers.js";

const LARGE_MARKER = "ROUND3-RUNTIME::" + "R".repeat(24_000);
const RUNTIME_TEST_IDENTITY = {
  kind: "teammate" as const,
  name: "runtime-test",
  role: "runtime_metrics_verifier",
  teamName: "tests",
};

test("runtime observability persists runtime stats across model/tool/compression/yield/continuation flows", { concurrency: false }, async (t) => {
  const root = await createTempWorkspace("round3-runtime-pack", t);
  const sessionStore = new SessionStore(path.join(root, "sessions"));
  const baseSession = await sessionStore.create(root);
  const inflatedHistory = Array.from({ length: 18 }, (_, index) =>
    index % 2 === 0
      ? createMessage("user", `older-user-${index} ${"U".repeat(1_600)}`)
      : createMessage("assistant", `older-assistant-${index} ${"A".repeat(1_600)}`),
  );
  const session = await sessionStore.save({
    ...baseSession,
    messages: inflatedHistory,
  });

  const requests: Array<{ messages: Array<{ role?: string; content?: unknown }> }> = [];
  const server = await startFakeOpenAiServer(async (payload) => {
    requests.push({ messages: payload.messages ?? [] });
    await sleep(20);
    if (requests.length === 1) {
      return toolCallsResponse([
        {
          name: "emit_large_runtime_pack",
          args: {},
        },
      ]);
    }
    return textResponse("Runtime dashboard summary complete.");
  });
  t.after(async () => {
    await server.close();
  });

  const result = await runManagedAgentTurn({
    input: "Capture runtime metrics, keep the context compressed when needed, and continue from the persisted session.",
    cwd: root,
    config: {
      ...createTestRuntimeConfig(root),
      baseUrl: server.baseUrl,
      yieldAfterToolSteps: 1,
      contextWindowMessages: 16,
      maxContextChars: 8_500,
      contextSummaryChars: 1_200,
    },
    session,
    sessionStore,
    toolRegistry: createRuntimeToolRegistry(),
    identity: RUNTIME_TEST_IDENTITY,
  });

  const saved = await sessionStore.load(result.session.id);
  const stats = (saved as any).runtimeStats;

  assert.equal(requests.length >= 2, true);
  assert.equal(stats?.model?.requestCount, requests.length);
  assert.equal(stats?.tools?.callCount, 1);
  assert.equal(stats?.tools?.byName?.emit_large_runtime_pack?.callCount, 1);
  assert.equal(stats?.events?.yieldCount, 1);
  assert.equal(stats?.events?.continuationCount >= 1, true);
  assert.equal(stats?.events?.compressionCount >= 1, true);
  assert.equal(stats?.externalizedToolResults?.count, 1);
  assert.equal(stats?.externalizedToolResults?.byteLengthTotal > 16_000, true);
  assert.equal(stats?.model?.usage?.requestsWithUsage, 0);
  assert.equal(stats?.model?.usage?.requestsWithoutUsage, requests.length);
  assert.equal(saved.checkpoint?.recentToolBatch?.tools?.includes("emit_large_runtime_pack"), true);
});

test("runtime observability records recovery runtime stats and survives reload", { concurrency: false }, async (t) => {
  const root = await createTempWorkspace("round3-runtime-recovery", t);
  const sessionStore = new SessionStore(path.join(root, "sessions"));
  const session = await sessionStore.create(root);

  const recovered = await persistRecoveryTurn(
    session,
    sessionStore,
    createProviderRecoveryTransition({
      consecutiveFailures: 1,
      error: new Error("temporary upstream timeout"),
      configuredModel: "deepseek-reasoner",
      requestModel: "deepseek-reasoner",
      requestConfig: {
        model: "deepseek-reasoner",
        contextWindowMessages: 30,
        maxContextChars: 48_000,
        contextSummaryChars: 8_000,
      },
      delayMs: 1_000,
    }),
  );
  const reloaded = await sessionStore.load(recovered.id);
  const stats = (reloaded as any).runtimeStats;

  assert.equal(stats?.events?.recoveryCount, 1);
  assert.equal(reloaded.checkpoint?.flow?.phase, "recovery");
  assert.equal(reloaded.checkpoint?.flow?.lastTransition?.reason?.code, "recover.provider_request_retry");
  assert.equal(reloaded.checkpoint?.flow?.lastTransition?.reason?.consecutiveFailures, 1);
});

test("runtime observability reload preserves current runtime stats without creating extra truth sources", { concurrency: false }, async (t) => {
  const root = await createTempWorkspace("round3-runtime-reload", t);
  const sessionStore = new SessionStore(path.join(root, "sessions"));
  const baseSession = await sessionStore.create(root);
  const timestamp = new Date().toISOString();
  const saved = await sessionStore.save({
    ...baseSession,
    messages: [createMessage("user", "Continue the same task.")],
    runtimeStats: {
      version: 1,
      model: {
        requestCount: 2,
        waitDurationMsTotal: 240,
        usage: {
          requestsWithUsage: 0,
          requestsWithoutUsage: 2,
          inputTokensTotal: 0,
          outputTokensTotal: 0,
          totalTokensTotal: 0,
          reasoningTokensTotal: 0,
        },
      },
      tools: {
        callCount: 1,
        durationMsTotal: 120,
        byName: {},
      },
      events: {
        continuationCount: 1,
        yieldCount: 0,
        recoveryCount: 0,
        compressionCount: 0,
      },
      externalizedToolResults: {
        count: 0,
        byteLengthTotal: 0,
      },
      updatedAt: timestamp,
    },
  } as any);

  const loaded = await sessionStore.load(saved.id);
  const stats = (loaded as any).runtimeStats;
  const raw = await fsSync.promises.readFile(path.join(root, "sessions", `${saved.id}.json`), "utf8");

  assert.equal(stats?.version, 1);
  assert.equal(stats?.model?.requestCount, 2);
  assert.equal(stats?.model?.usage?.requestsWithoutUsage, 2);
  assert.equal(stats?.tools?.callCount, 1);
  assert.deepEqual(stats?.tools?.byName ?? {}, {});
  assert.equal(stats?.events?.continuationCount, 1);
  assert.equal(stats?.externalizedToolResults?.count, 0);
  assert.equal("promptDiagnostics" in stats, false);
  assert.equal(raw.includes("\"promptMetrics\""), false);
  assert.equal(raw.includes("\"hotspots\""), false);
  assert.equal(raw.includes("\"derivedDiagnostics\""), false);
  assert.equal(raw.includes("\"contextDiagnostics\""), false);
});

test("runtime observability summary separates durable truth from derived diagnostics and explains the active control flow", () => {
  const summary = buildSessionRuntimeSummary({
    runtimeStats: {
      version: 1,
      model: {
        requestCount: 4,
        waitDurationMsTotal: 2_600,
        usage: {
          requestsWithUsage: 0,
          requestsWithoutUsage: 4,
          inputTokensTotal: 0,
          outputTokensTotal: 0,
          totalTokensTotal: 0,
          reasoningTokensTotal: 0,
        },
      },
      tools: {
        callCount: 2,
        durationMsTotal: 420,
        byName: {
          run_shell: {
            callCount: 1,
            durationMsTotal: 320,
            okCount: 0,
            errorCount: 1,
          },
          read_file: {
            callCount: 1,
            durationMsTotal: 100,
            okCount: 1,
            errorCount: 0,
          },
        },
      },
      events: {
        continuationCount: 1,
        yieldCount: 0,
        recoveryCount: 2,
        compressionCount: 1,
      },
      externalizedToolResults: {
        count: 0,
        byteLengthTotal: 0,
      },
      updatedAt: new Date().toISOString(),
    },
    checkpoint: {
      version: 1,
      objective: "Finish runtime observability.",
      status: "active",
      completedSteps: ["Captured runtime metrics"],
      flow: {
        phase: "active",
        reason: "continue.verification_required",
        lastTransition: {
          action: "continue",
          reason: {
            code: "continue.verification_required",
            pendingPaths: ["src/agent/runtimeMetrics/summary.ts"],
            attempts: 1,
            reminderCount: 2,
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
      reminderCount: 2,
      noProgressCount: 0,
      maxAttempts: 3,
      maxNoProgress: 2,
      maxReminders: 3,
      pendingPaths: ["src/agent/runtimeMetrics/summary.ts"],
      updatedAt: new Date().toISOString(),
    },
  } as any);

  assert.equal(summary.durableTruth.checkpoint.lastTransition?.reason.code, "continue.verification_required");
  assert.equal(summary.durableTruth.verification.status, "required");
  assert.equal(summary.derivedDiagnostics.controlFlow.whyContinue?.reasonCode, "continue.verification_required");
  assert.match(summary.derivedDiagnostics.controlFlow.whyContinue?.summary ?? "", /verification/i);
  assert.match(summary.derivedDiagnostics.performance.whySlow.map((entry) => entry.summary).join("\n"), /model wait/i);
  assert.equal(summary.derivedDiagnostics.performance.flakyTools[0]?.name, "run_shell");
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
        model: "deepseek-reasoner",
        mode: "agent",
        baseUrl: "https://api.deepseek.com",
        allowedRoots: [process.cwd()],
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
