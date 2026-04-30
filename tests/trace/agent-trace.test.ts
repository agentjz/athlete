import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { runManagedAgentTurn } from "../../src/agent/turn.js";
import { SessionStore } from "../../src/agent/session.js";
import { createToolRegistry } from "../../src/capabilities/tools/core/registry.js";
import type { FunctionToolDefinition, ToolRegistry } from "../../src/capabilities/tools/index.js";
import { getProjectStatePaths } from "../../src/project/statePaths.js";
import { createTempWorkspace, createTestRuntimeConfig, makeToolContext } from "../helpers.js";

interface FakeResponse {
  kind: "text" | "tool";
  content?: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
}

test("agent trace records replayable model and tool dossier without injecting trace into prompt", async (t) => {
  const root = await createTempWorkspace("agent-trace", t);
  const sessionStore = new SessionStore(path.join(root, "sessions"));
  const session = await sessionStore.create(root);
  const requests: Array<{ messages: Array<{ role?: string; content?: unknown }> }> = [];
  let requestCount = 0;
  const server = await startFakeOpenAiServer(async (payload) => {
    requests.push({ messages: payload.messages ?? [] });
    requestCount += 1;
    if (requestCount === 1) {
      return {
        kind: "tool",
        toolCalls: [{
          name: "large_trace_tool",
          args: { target: "alpha" },
        }],
      };
    }

    return {
      kind: "text",
      content: "trace complete",
    };
  });
  t.after(async () => {
    await server.close();
  });

  const result = await runManagedAgentTurn({
    input: "build a trace dossier",
    cwd: root,
    config: {
      ...createTestRuntimeConfig(root),
      baseUrl: server.baseUrl,
    },
    session,
    sessionStore,
    toolRegistry: createSingleToolRegistry("large_trace_tool", async () => ({
      ok: true,
      output: JSON.stringify({
        ok: true,
        marker: "TRACE-ARTIFACT-MARKER",
        payload: "x".repeat(20_000),
      }),
    })),
  });

  const traceFile = path.join(getProjectStatePaths(root).tracesDir, `${result.session.id}.jsonl`);
  const rawTrace = await fs.readFile(traceFile, "utf8");
  const traceEvents = rawTrace.trim().split(/\r?\n/).map((line) => JSON.parse(line) as Record<string, unknown>);
  const traceKinds = traceEvents.map((event) => event.kind);

  assert.equal(JSON.stringify(requests).includes("agent_trace"), false);
  assert.deepEqual(traceKinds, [
    "turn_started",
    "model_request",
    "model_response",
    "tool_call",
    "tool_result",
    "model_request",
    "model_response",
    "turn_finalized",
  ]);
  assert.equal(traceEvents.every((event, index) => event.sequence === index + 1), true);
  assert.equal((traceEvents.find((event) => event.kind === "tool_call")?.data as Record<string, unknown>)?.toolName, "large_trace_tool");
  assert.equal((traceEvents.find((event) => event.kind === "tool_result")?.data as Record<string, unknown>)?.externalized, true);

  const registry = createToolRegistry();
  const context = makeToolContext(root, root, {
    config: createTestRuntimeConfig(root),
    sessionId: result.session.id,
  }) as never;

  const list = JSON.parse((await registry.execute(
    "agent_trace_list",
    JSON.stringify({ limit: 10 }),
    context,
  )).output) as { traces?: Array<{ sessionId?: string }> };
  assert.equal(list.traces?.some((entry) => entry.sessionId === result.session.id), true);

  const read = JSON.parse((await registry.execute(
    "agent_trace_read",
    JSON.stringify({ session_id: result.session.id, include_artifacts: true }),
    context,
  )).output) as Record<string, unknown>;
  assert.equal(read.count, 8);
  assert.match(JSON.stringify(read), /TRACE-ARTIFACT-MARKER/);
});

test("agent trace tools are governed as read-only trace capabilities", () => {
  const registry = createToolRegistry();
  for (const name of ["agent_trace_list", "agent_trace_read"]) {
    const entry = registry.entries?.find((item) => item.name === name);
    assert.ok(entry, `${name} should be registered`);
    assert.equal(entry.governance.specialty, "trace");
    assert.equal(entry.governance.mutation, "read");
    assert.equal(entry.governance.changeSignal, "none");
    assert.equal(entry.governance.verificationSignal, "none");
  }
});

test("agent trace artifact write failures do not change turn semantics", async (t) => {
  const root = await createTempWorkspace("agent-trace-side-channel", t);
  const sessionStore = new SessionStore(path.join(root, "sessions"));
  const session = await sessionStore.create(root);
  const tracePath = getProjectStatePaths(root).tracesDir;
  await fs.mkdir(path.dirname(tracePath), { recursive: true });
  await fs.writeFile(tracePath, "not-a-directory", "utf8");
  const server = await startFakeOpenAiServer(async () => ({
    kind: "text",
    content: "trace side channel did not block",
  }));
  t.after(async () => {
    await server.close();
  });

  const result = await runManagedAgentTurn({
    input: "finish despite trace write failure",
    cwd: root,
    config: {
      ...createTestRuntimeConfig(root),
      baseUrl: server.baseUrl,
    },
    session,
    sessionStore,
    toolRegistry: createSingleToolRegistry("noop_tool", async () => ({
      ok: true,
      output: "noop",
    })),
  });

  assert.equal(result.paused, false);
  assert.equal(result.session.messages.at(-1)?.content, "trace side channel did not block");
});

function createSingleToolRegistry(
  toolName: string,
  execute: ToolRegistry["execute"],
): ToolRegistry {
  return {
    definitions: [createFunctionTool(toolName)],
    execute,
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
