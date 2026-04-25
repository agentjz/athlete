import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { runManagedAgentTurn } from "../src/agent/turn.js";
import { MemorySessionStore } from "../src/agent/session.js";
import { createToolRegistry, createToolSource } from "../src/tools/registry.js";
import type { RegisteredTool, ToolRegistry } from "../src/tools/types.js";
import type { AgentCallbacks } from "../src/agent/types.js";
import type { SessionRecord, ToolExecutionResult } from "../src/types.js";
import { createTempWorkspace, createTestRuntimeConfig, makeToolContext } from "./helpers.js";

test("tool batches preflight in source order, persist pendingToolCalls, and finalize parallel results in assistant order", async (t) => {
  const root = await createTempWorkspace("tool-batch-parallel", t);
  const sessionStore = new RecordingSessionStore();
  const session = await sessionStore.create(root);
  const events: string[] = [];

  const server = await startFakeOpenAiServer((request) => {
    if (requestCount(request) === 1) {
      return toolCallsResponse([
        { id: "call-1", name: "parallel_one", args: {} },
        { id: "call-2", name: "parallel_two", args: {} },
      ]);
    }

    return textResponse("done");
  });
  t.after(async () => {
    await server.close();
  });

  const result = await runManagedAgentTurn({
    input: "Run the tool batch.",
    cwd: root,
    config: {
      ...createTestRuntimeConfig(root),
      baseUrl: server.baseUrl,
    },
    session,
    sessionStore,
    toolRegistry: createBatchRegistry(events),
    callbacks: createBatchCallbacks(events),
    identity: {
      kind: "teammate",
      name: "batch-test",
    },
  });

  assert.equal(result.paused, false);
  assert.equal(result.yielded, false);
  assert.equal(events.indexOf("before:parallel_one") < events.indexOf("execute-start:parallel_one"), true);
  assert.equal(events.indexOf("before:parallel_two") < events.indexOf("execute-start:parallel_one"), true);

  const toolMessages = result.session.messages.filter((message) => message.role === "tool");
  assert.deepEqual(toolMessages.map((message) => message.name), ["parallel_one", "parallel_two"]);
  assert.equal(
    sessionStore.savedSnapshots.some((snapshot) =>
      (snapshot.checkpoint?.flow as { pendingToolCalls?: Array<{ name?: string }> } | undefined)?.pendingToolCalls?.map((entry) => entry.name).join(",") === "parallel_one,parallel_two"
    ),
    true,
  );
  assert.equal(
    sessionStore.savedSnapshots.some(
      (snapshot) => (snapshot.checkpoint?.flow as { runState?: { status?: string } } | undefined)?.runState?.status === "busy",
    ),
    true,
  );
  assert.equal((result.session.checkpoint?.flow as { runState?: { status?: string } } | undefined)?.runState?.status, "idle");
  assert.equal((result.session.checkpoint?.flow as { runState?: { pendingToolCallCount?: number } } | undefined)?.runState?.pendingToolCallCount, 0);
  assert.deepEqual((result.session.checkpoint?.flow as { pendingToolCalls?: unknown[] } | undefined)?.pendingToolCalls ?? [], []);
});

test("tool loop guard blocks only after a repeated read returns the same result", async (t) => {
  const root = await createTempWorkspace("tool-loop-guard-read", t);
  const sessionStore = new RecordingSessionStore();
  const session = await sessionStore.create(root);
  const events: string[] = [];

  const server = await startFakeOpenAiServer((request) => {
    if (request.requestIndex <= 3) {
      return toolCallsResponse([
        { id: `call-${request.requestIndex}`, name: "read_probe", args: {} },
      ]);
    }

    return textResponse("done");
  });
  t.after(async () => {
    await server.close();
  });

  const result = await runManagedAgentTurn({
    input: "Repeat a read until the loop guard proves no progress.",
    cwd: root,
    config: {
      ...createTestRuntimeConfig(root),
      baseUrl: server.baseUrl,
    },
    session,
    sessionStore,
    toolRegistry: createToolRegistry("agent", {
      onlyNames: ["read_probe"],
      sources: [createToolSource("host", "tests.loop-guard-read", [
        createTestTool("read_probe", events, 1, {
          mutation: "read",
          concurrencySafe: true,
        }),
      ])],
    }),
    identity: {
      kind: "teammate",
      name: "batch-test",
    },
  });

  const toolMessages = result.session.messages.filter((message) => message.role === "tool" && message.name === "read_probe");
  assert.equal(events.filter((event) => event === "execute-start:read_probe").length, 3);
  assert.equal(toolMessages.length, 3);
  assert.doesNotMatch(String(toolMessages[0]?.content ?? ""), /LOOP_GUARD_BLOCKED/);
  assert.doesNotMatch(String(toolMessages[1]?.content ?? ""), /LOOP_GUARD_BLOCKED/);
  assert.match(String(toolMessages[2]?.content ?? ""), /LOOP_GUARD_BLOCKED/);
  assert.match(String(toolMessages[2]?.content ?? ""), /same result/i);
});
test("any sequential tool forces the whole batch back to sequential execution", async (t) => {
  const root = await createTempWorkspace("tool-batch-sequential", t);
  const sessionStore = new RecordingSessionStore();
  const session = await sessionStore.create(root);
  const events: string[] = [];

  const server = await startFakeOpenAiServer((request) => {
    if (requestCount(request) === 1) {
      return toolCallsResponse([
        { id: "call-1", name: "parallel_one", args: {} },
        { id: "call-2", name: "sequential_write", args: {} },
      ]);
    }

    return textResponse("done");
  });
  t.after(async () => {
    await server.close();
  });

  const result = await runManagedAgentTurn({
    input: "Run the mixed tool batch.",
    cwd: root,
    config: {
      ...createTestRuntimeConfig(root),
      baseUrl: server.baseUrl,
    },
    session,
    sessionStore,
    toolRegistry: createBatchRegistry(events, { includeSequentialTool: true }),
    identity: {
      kind: "teammate",
      name: "batch-test",
    },
  });

  assert.equal(result.yielded, false);
  assert.equal(events.indexOf("execute-end:parallel_one") < events.indexOf("execute-start:sequential_write"), true);
});

test("beforeToolCall blocks and afterToolCall failures become formal tool errors instead of breaking the turn", async (t) => {
  const root = await createTempWorkspace("tool-batch-hooks", t);
  const sessionStore = new RecordingSessionStore();
  const session = await sessionStore.create(root);

  const server = await startFakeOpenAiServer((request) => {
    if (requestCount(request) === 1) {
      return toolCallsResponse([
        { id: "call-1", name: "blocked_tool", args: {} },
        { id: "call-2", name: "after_fail_tool", args: {} },
      ]);
    }

    return textResponse("done");
  });
  t.after(async () => {
    await server.close();
  });

  const result = await runManagedAgentTurn({
    input: "Run the hooked tool batch.",
    cwd: root,
    config: {
      ...createTestRuntimeConfig(root),
      baseUrl: server.baseUrl,
    },
    session,
    sessionStore,
    toolRegistry: createHookRegistry(),
    callbacks: {
      beforeToolCall: async ({ toolCall }) => {
        if (toolCall.function.name === "blocked_tool") {
          return {
            block: true,
            reason: "blocked by before hook",
          };
        }
        return undefined;
      },
      afterToolCall: async ({ toolCall }) => {
        if (toolCall.function.name === "after_fail_tool") {
          throw new Error("after hook exploded");
        }
        return undefined;
      },
    },
    identity: {
      kind: "teammate",
      name: "batch-test",
    },
  });

  assert.equal(result.yielded, false);
  const toolMessages = result.session.messages.filter((message) => message.role === "tool");
  assert.equal(toolMessages.length, 2);

  const blockedPayload = JSON.parse(String(toolMessages[0]?.content ?? "{}")) as Record<string, unknown>;
  const failedPayload = JSON.parse(String(toolMessages[1]?.content ?? "{}")) as Record<string, unknown>;

  assert.equal(blockedPayload.code, "TOOL_HOOK_BLOCKED");
  assert.equal((blockedPayload.protocol as Record<string, unknown>).status, "blocked");
  assert.equal(failedPayload.code, "TOOL_HOOK_FAILED");
  assert.equal((failedPayload.protocol as Record<string, unknown>).status, "failed");
});

test("prepare-phase strictness keeps L0 unknown args tolerant while preserving schema safety", async () => {
  const executeArgs: Array<Record<string, unknown>> = [];
  const registry = createStrictContractRegistry({
    toolName: "strict_contract_l0_read",
    mutation: "read",
    risk: "low",
    onExecute: (args) => executeArgs.push(args),
  });

  const tolerantResult = await registry.execute(
    "strict_contract_l0_read",
    JSON.stringify({
      path: "a.txt",
      stdin: "unexpected",
    }),
    makeToolContext(process.cwd()) as never,
  );
  const tolerantPayload = JSON.parse(tolerantResult.output) as Record<string, unknown>;

  assert.equal(tolerantResult.ok, true);
  assert.equal((tolerantPayload.args as Record<string, unknown>).path, "a.txt");
  assert.equal(Object.hasOwn((tolerantPayload.args as Record<string, unknown>), "stdin"), false);
  assert.equal(executeArgs.length, 1);
  assert.equal(Object.hasOwn(executeArgs[0]!, "stdin"), false);
  assert.equal(tolerantResult.metadata?.protocol?.status, "completed");
  assert.equal(tolerantResult.metadata?.protocol?.argumentStrictness?.tier, "L0");
  assert.equal(tolerantResult.metadata?.protocol?.argumentStrictness?.warning, true);
  assert.deepEqual(tolerantResult.metadata?.protocol?.argumentStrictness?.unknownArgsStripped, ["$.stdin"]);
  assert.deepEqual(tolerantResult.metadata?.protocol?.phases, ["prepare", "execute", "finalize"]);

  const typeViolationResult = await registry.execute(
    "strict_contract_l0_read",
    JSON.stringify({
      path: 123,
      stdin: "unexpected",
    }),
    makeToolContext(process.cwd()) as never,
  );
  const typeViolationPayload = JSON.parse(typeViolationResult.output) as Record<string, unknown>;

  assert.equal(typeViolationResult.ok, false);
  assert.equal(typeViolationPayload.code, "INVALID_TOOL_ARGUMENTS");
  assert.equal(executeArgs.length, 1);
  assert.equal(typeViolationResult.metadata?.protocol?.status, "blocked");
  assert.equal(typeViolationResult.metadata?.protocol?.blockedIn, "prepare");
  assert.deepEqual(typeViolationResult.metadata?.protocol?.phases, ["prepare", "finalize"]);
});

test("prepare-phase strictness blocks unknown args for L1 and L2 tools", async () => {
  const l1ExecuteCalls: string[] = [];
  const l2ExecuteCalls: string[] = [];
  const registry = createToolRegistry("agent", {
    onlyNames: ["strict_contract_l1_state", "strict_contract_l2_write"],
    sources: [createToolSource("host", "tests.strict-contract-tiered", [
      createStrictContractTool({
        name: "strict_contract_l1_state",
        mutation: "state",
        risk: "medium",
        onExecute: () => l1ExecuteCalls.push("strict_contract_l1_state"),
      }),
      createStrictContractTool({
        name: "strict_contract_l2_write",
        mutation: "write",
        risk: "high",
        destructive: true,
        onExecute: () => l2ExecuteCalls.push("strict_contract_l2_write"),
      }),
    ])],
  });

  const l1Result = await registry.execute(
    "strict_contract_l1_state",
    JSON.stringify({
      path: "a.txt",
      stdin: "unexpected",
    }),
    makeToolContext(process.cwd()) as never,
  );
  const l1Payload = JSON.parse(l1Result.output) as Record<string, unknown>;
  assert.equal(l1Result.ok, false);
  assert.equal(l1Payload.code, "INVALID_TOOL_ARGUMENTS");
  assert.equal(l1ExecuteCalls.length, 0);
  assert.equal(l1Result.metadata?.protocol?.argumentStrictness?.tier, "L1");
  assert.equal(l1Result.metadata?.protocol?.status, "blocked");
  assert.equal(l1Result.metadata?.protocol?.blockedIn, "prepare");
  assert.deepEqual(l1Result.metadata?.protocol?.phases, ["prepare", "finalize"]);

  const l2Result = await registry.execute(
    "strict_contract_l2_write",
    JSON.stringify({
      path: "a.txt",
      stdin: "unexpected",
    }),
    makeToolContext(process.cwd()) as never,
  );
  const l2Payload = JSON.parse(l2Result.output) as Record<string, unknown>;
  assert.equal(l2Result.ok, false);
  assert.equal(l2Payload.code, "INVALID_TOOL_ARGUMENTS");
  assert.equal(l2ExecuteCalls.length, 0);
  assert.equal(l2Result.metadata?.protocol?.argumentStrictness?.tier, "L2");
  assert.equal(l2Result.metadata?.protocol?.status, "blocked");
  assert.equal(l2Result.metadata?.protocol?.blockedIn, "prepare");
  assert.deepEqual(l2Result.metadata?.protocol?.phases, ["prepare", "finalize"]);
});

class RecordingSessionStore extends MemorySessionStore {
  readonly savedSnapshots: SessionRecord[] = [];

  override async save(session: SessionRecord): Promise<SessionRecord> {
    const saved = await super.save(session);
    this.savedSnapshots.push(JSON.parse(JSON.stringify(saved)) as SessionRecord);
    return saved;
  }
}

function createBatchCallbacks(events: string[]): AgentCallbacks {
  return {
    beforeToolCall: async ({ toolCall }) => {
      events.push(`before:${toolCall.function.name}`);
      return undefined;
    },
    afterToolCall: async ({ toolCall }) => {
      events.push(`after:${toolCall.function.name}`);
      return undefined;
    },
  };
}

function createBatchRegistry(
  events: string[],
  options: {
    includeSequentialTool?: boolean;
  } = {},
): ToolRegistry {
  const tools: RegisteredTool[] = [
    createTestTool("parallel_one", events, 40, {
      mutation: "read",
      concurrencySafe: true,
    }),
    createTestTool("parallel_two", events, 5, {
      mutation: "read",
      concurrencySafe: true,
    }),
  ];

  if (options.includeSequentialTool) {
    tools.push(
      createTestTool("sequential_write", events, 5, {
        mutation: "write",
        concurrencySafe: false,
      }),
    );
  }

  return createToolRegistry("agent", {
    onlyNames: tools.map((tool) => tool.definition.function.name),
    sources: [createToolSource("host", "tests.batch", tools)],
  });
}

function createHookRegistry(): ToolRegistry {
  const tools: RegisteredTool[] = [
    createTestTool("blocked_tool", [], 1, {
      mutation: "read",
      concurrencySafe: true,
    }),
    createTestTool("after_fail_tool", [], 1, {
      mutation: "read",
      concurrencySafe: true,
    }),
  ];

  return createToolRegistry("agent", {
    onlyNames: tools.map((tool) => tool.definition.function.name),
    sources: [createToolSource("host", "tests.batch-hooks", tools)],
  });
}

function createStrictContractRegistry(input: {
  toolName: string;
  mutation: "read" | "state" | "write";
  risk: "low" | "medium" | "high";
  destructive?: boolean;
  onExecute: (args: Record<string, unknown>) => void;
}): ToolRegistry {
  return createToolRegistry("agent", {
    onlyNames: [input.toolName],
    sources: [createToolSource("host", "tests.strict-contract", [
      createStrictContractTool({
        name: input.toolName,
        mutation: input.mutation,
        risk: input.risk,
        destructive: input.destructive,
        onExecute: input.onExecute,
      }),
    ])],
  });
}

function createStrictContractTool(input: {
  name: string;
  mutation: "read" | "state" | "write";
  risk: "low" | "medium" | "high";
  destructive?: boolean;
  onExecute: (args: Record<string, unknown>) => void;
}): RegisteredTool {
  return {
    definition: {
      type: "function",
      function: {
        name: input.name,
        description: "Strict argument contract test tool",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
            },
          },
          required: ["path"],
          additionalProperties: false,
        },
      },
    },
    governance: {
      source: "host",
      specialty: "filesystem",
      mutation: input.mutation,
      risk: input.risk,
      destructive: input.destructive ?? false,
      concurrencySafe: true,
      changeSignal: "none",
      verificationSignal: "none",
      preferredWorkflows: [],
      fallbackOnlyInWorkflows: [],
    },
    async execute(rawArgs) {
      const args = JSON.parse(rawArgs) as Record<string, unknown>;
      input.onExecute(args);
      return okResult(JSON.stringify({ ok: true, args }));
    },
  };
}

function createTestTool(
  name: string,
  events: string[],
  delayMs: number,
  options: {
    mutation: "read" | "write";
    concurrencySafe: boolean;
  },
): RegisteredTool {
  return {
    definition: {
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
    },
    governance: {
      source: "host",
      specialty: "filesystem",
      mutation: options.mutation,
      risk: options.mutation === "read" ? "low" : "medium",
      destructive: false,
      concurrencySafe: options.concurrencySafe,
      changeSignal: "none",
      verificationSignal: "none",
      preferredWorkflows: [],
      fallbackOnlyInWorkflows: [],
    },
    async execute() {
      events.push(`execute-start:${name}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      events.push(`execute-end:${name}`);
      return okResult(
        JSON.stringify({
          ok: true,
          tool: name,
        }),
      );
    },
  };
}

function okResult(output: string, metadata?: ToolExecutionResult["metadata"]): ToolExecutionResult {
  return {
    ok: true,
    output,
    metadata,
  };
}

interface FakeRequest {
  requestIndex: number;
  messages: Array<Record<string, unknown>>;
}

interface FakeToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

interface FakeResponse {
  content?: string;
  toolCalls?: FakeToolCall[];
}

function textResponse(content: string): FakeResponse {
  return { content };
}

function toolCallsResponse(toolCalls: FakeToolCall[]): FakeResponse {
  return { toolCalls };
}

async function startFakeOpenAiServer(
  respond: (request: FakeRequest) => FakeResponse,
): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  let requestIndex = 0;
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/chat/completions") {
      res.writeHead(404).end();
      return;
    }

    const body = await readRequestBody(req);
    const payload = JSON.parse(body) as { messages?: Array<Record<string, unknown>> };
    requestIndex += 1;
    const response = respond({
      requestIndex,
      messages: payload.messages ?? [],
    });
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
    });

    if (response.toolCalls && response.toolCalls.length > 0) {
      res.write(
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: response.toolCalls.map((toolCall, index) => ({
                  index,
                  id: toolCall.id,
                  function: {
                    name: toolCall.name,
                    arguments: JSON.stringify(toolCall.args),
                  },
                })),
              },
            },
          ],
        })}\n\n`,
      );
    } else {
      res.write(
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                content: response.content ?? "",
              },
            },
          ],
        })}\n\n`,
      );
    }

    res.end("data: [DONE]\n\n");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected an ephemeral HTTP port.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}

async function readRequestBody(request: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function requestCount(request: FakeRequest): number {
  return request.requestIndex;
}
