import assert from "node:assert/strict";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { runManagedAgentTurn } from "../src/agent/managedTurn.js";
import { createMessage } from "../src/agent/messages.js";
import { SessionStore } from "../src/agent/sessionStore.js";
import { persistRecoveryTurn } from "../src/agent/turnPersistence.js";
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
    1,
    new Error("temporary upstream timeout"),
  );
  const reloaded = await sessionStore.load(recovered.id);
  const stats = (reloaded as any).runtimeStats;

  assert.equal(stats?.events?.recoveryCount, 1);
  assert.equal(reloaded.checkpoint?.flow?.phase, "recovery");
});

test("runtime observability normalizes legacy runtime stats instead of dropping or guessing fields", { concurrency: false }, async (t) => {
  const root = await createTempWorkspace("round3-runtime-legacy", t);
  const sessionsDir = path.join(root, "sessions");
  await fs.mkdir(sessionsDir, { recursive: true });

  const sessionId = "legacy-round3-runtime";
  const timestamp = new Date().toISOString();
  await fs.writeFile(path.join(sessionsDir, `${sessionId}.json`), `${JSON.stringify({
    id: sessionId,
    createdAt: timestamp,
    updatedAt: timestamp,
    cwd: root,
    messageCount: 1,
    messages: [createMessage("user", "Continue the same task.")],
    todoItems: [],
    runtimeStats: {
      model: {
        requestCount: 2,
      },
      tools: {
        callCount: 1,
      },
    },
  }, null, 2)}\n`, "utf8");

  const sessionStore = new SessionStore(sessionsDir);
  const loaded = await sessionStore.load(sessionId);
  const stats = (loaded as any).runtimeStats;

  assert.equal(stats?.version, 1);
  assert.equal(stats?.model?.requestCount, 2);
  assert.equal(stats?.model?.usage?.requestsWithUsage, 0);
  assert.equal(stats?.model?.usage?.requestsWithoutUsage, 0);
  assert.equal(stats?.tools?.callCount, 1);
  assert.deepEqual(stats?.tools?.byName ?? {}, {});
  assert.equal(stats?.events?.yieldCount, 0);
  assert.equal(stats?.externalizedToolResults?.count, 0);
});

test("runtime observability local command prints a readable session summary with stable usage-unavailable wording", async () => {
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
      } as any,
      config: {
        model: "deepseek-reasoner",
        mode: "agent",
        baseUrl: "https://api.deepseek.com",
      } as any,
    });

    assert.equal(result, "handled");
  });

  assert.match(output, /model requests/i);
  assert.match(output, /tool calls/i);
  assert.match(output, /usage: unavailable/i);
  assert.match(output, /externalized results/i);
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
