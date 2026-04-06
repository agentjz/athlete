import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { buildRequestContext } from "../src/agent/contextBuilder.js";
import { runManagedAgentTurn } from "../src/agent/managedTurn.js";
import { createMessage } from "../src/agent/messages.js";
import { shrinkMessagesForContextLimit } from "../src/agent/recovery.js";
import { SessionStore } from "../src/agent/sessionStore.js";
import { buildSystemPrompt } from "../src/agent/systemPrompt.js";
import type { FunctionToolDefinition, ToolRegistry } from "../src/tools/index.js";
import type { ProjectContext, StoredMessage, ToolExecutionResult } from "../src/types.js";
import { createTempWorkspace, createTestRuntimeConfig } from "./helpers.js";

const LARGE_MARKER_ONE = "ROUND1-LARGE-ONE::" + "A".repeat(24_000);
const LARGE_MARKER_TWO = "ROUND1-LARGE-TWO::" + "B".repeat(24_000);
const RUNTIME_TEST_IDENTITY = {
  kind: "teammate" as const,
  name: "runtime-test",
  role: "runtime_verifier",
  teamName: "tests",
};
const SMALL_RESULT = JSON.stringify(
  {
    ok: true,
    summary: "small inline result",
    preview: "inline",
  },
  null,
  2,
);

test("runtime context prompt keeps a stable static layer separate from the dynamic runtime layer", { concurrency: false }, (t) => {
  const realDate = globalThis.Date;
  const fixedIso = "2026-04-04T00:00:00.000Z";

  class FixedDate extends Date {
    constructor(value?: string | number | Date) {
      super(value ?? fixedIso);
    }

    static now(): number {
      return new realDate(fixedIso).valueOf();
    }
  }

  Object.defineProperty(globalThis, "Date", {
    configurable: true,
    value: FixedDate,
  });
  t.after(() => {
    Object.defineProperty(globalThis, "Date", {
      configurable: true,
      value: realDate,
    });
  });

  const projectContext: ProjectContext = {
    rootDir: process.cwd(),
    stateRootDir: process.cwd(),
    cwd: process.cwd(),
    instructions: [],
    instructionText: "Always review carefully.",
    instructionTruncated: false,
    skills: [],
    ignoreRules: [],
  };
  const config = createTestRuntimeConfig(process.cwd());

  const first = buildSystemPrompt(
    process.cwd(),
    config,
    projectContext,
    undefined,
    undefined,
    undefined,
    {
      taskSummary: "Task board says alpha",
      teamSummary: "No teammates.",
      worktreeSummary: "No worktrees.",
      backgroundSummary: "No background jobs.",
      protocolSummary: "No protocol requests.",
      coordinationPolicySummary: "- plan decisions: locked",
    },
  );
  const second = buildSystemPrompt(
    process.cwd(),
    config,
    projectContext,
    undefined,
    undefined,
    undefined,
    {
      taskSummary: "Task board says beta",
      teamSummary: "Teammate bravo is active.",
      worktreeSummary: "feature/light-pack",
      backgroundSummary: "job-7 running",
      protocolSummary: "request-1 pending",
      coordinationPolicySummary: "- plan decisions: unlocked",
    },
  );

  const firstLayers = splitPromptLayers(first);
  const secondLayers = splitPromptLayers(second);

  assert.equal(firstLayers.staticLayer, secondLayers.staticLayer);
  assert.notEqual(firstLayers.dynamicLayer, secondLayers.dynamicLayer);
  assert.equal(firstLayers.staticLayer.includes("Task board says alpha"), false);
  assert.equal(firstLayers.staticLayer.includes("Teammate bravo is active."), false);
  assert.match(firstLayers.dynamicLayer, /Task board says alpha/);
  assert.match(secondLayers.dynamicLayer, /Teammate bravo is active\./);
});

test("runtime context externalizes large tool results for continuation and preserves them after session reload", { concurrency: false }, async (t) => {
  const root = await createTempWorkspace("round1-large-result", t);
  const sessionStore = new SessionStore(path.join(root, "sessions"));
  const session = await sessionStore.create(root);
  const requests: FakeOpenAiRequest[] = [];

  const server = await startFakeOpenAiServer((request) => {
    requests.push(request);
    if (requests.length === 1) {
      return toolCallsResponse([
        {
          name: "emit_large_one",
          args: {},
        },
      ]);
    }

    return textResponse("Continuation finished from the stored tool-result preview.");
  });
  t.after(async () => {
    await server.close();
  });

  const result = await runManagedAgentTurn({
    input: "Inspect the large report, keep the context light, and continue from it.",
    cwd: root,
    config: {
      ...createTestRuntimeConfig(root),
      baseUrl: server.baseUrl,
      yieldAfterToolSteps: 1,
    },
    session,
    sessionStore,
    toolRegistry: createRound1ToolRegistry(),
    identity: RUNTIME_TEST_IDENTITY,
  });

  assert.equal(result.yielded, false);
  assert.ok(requests.length >= 2);

  const continuationRequest = requests.slice(1).find((request) =>
    request.messages.some((message) => message.role === "tool"),
  );
  assert.ok(continuationRequest);

  const continuedToolMessage = continuationRequest?.messages.find((message) => message.role === "tool");
  assert.ok(continuedToolMessage);
  assert.match(String(continuedToolMessage?.content ?? ""), /"externalized"\s*:\s*true/);
  assert.match(String(continuedToolMessage?.content ?? ""), /"storagePath"\s*:/);
  assert.doesNotMatch(String(continuedToolMessage?.content ?? ""), /ROUND1-LARGE-ONE::/);

  const saved = await sessionStore.load(result.session.id);
  const storedToolMessage = saved.messages.find((message) => message.role === "tool" && message.name === "emit_large_one");
  assert.ok(storedToolMessage);

  const storedPayload = parseMessageJson(storedToolMessage as StoredMessage);
  const storagePath = readStoragePath(storedPayload);
  assert.ok(storagePath);
  assert.equal(await fs.readFile(resolveArtifactPath(root, storagePath), "utf8"), buildLargeToolOutput(LARGE_MARKER_ONE));
});

test("runtime context keeps externalized tool previews across compression and recovery shrink", { concurrency: false }, async (t) => {
  const root = await createTempWorkspace("round1-context", t);
  const sessionStore = new SessionStore(path.join(root, "sessions"));
  let session = await sessionStore.create(root);
  const requests: FakeOpenAiRequest[] = [];

  const server = await startFakeOpenAiServer((request) => {
    requests.push(request);
    if (requests.length === 1) {
      return toolCallsResponse([
        {
          name: "emit_large_one",
          args: {},
        },
      ]);
    }

    return textResponse("done");
  });
  t.after(async () => {
    await server.close();
  });

  const result = await runManagedAgentTurn({
    input: "Produce a large analysis artifact and keep going.",
    cwd: root,
    config: {
      ...createTestRuntimeConfig(root),
      baseUrl: server.baseUrl,
      yieldAfterToolSteps: 1,
    },
    session,
    sessionStore,
    toolRegistry: createRound1ToolRegistry(),
    identity: RUNTIME_TEST_IDENTITY,
  });

  session = await sessionStore.load(result.session.id);
  const olderMessages = Array.from({ length: 14 }, (_, index) =>
    index % 2 === 0
      ? createMessage("user", `older-user-${index} ${"U".repeat(1_600)}`)
      : createMessage("assistant", `older-assistant-${index} ${"V".repeat(1_600)}`),
  );

  const built = buildRequestContext("system", [...olderMessages, ...session.messages], {
    contextWindowMessages: 16,
    model: "deepseek-reasoner",
    maxContextChars: 8_500,
    contextSummaryChars: 1_400,
  });

  assert.equal(built.compressed, true);
  const compressedToolMessage = built.messages.find((message) => message.role === "tool");
  assert.ok(compressedToolMessage);
  assert.match(String(compressedToolMessage?.content ?? ""), /"externalized"\s*:\s*true/);
  assert.match(String(compressedToolMessage?.content ?? ""), /"storagePath"\s*:/);

  const shrunk = shrinkMessagesForContextLimit(built.messages);
  const shrunkToolMessage = shrunk.find((message) => message.role === "tool");
  assert.ok(shrunkToolMessage);
  assert.match(String(shrunkToolMessage?.content ?? ""), /"storagePath"\s*:/);
  assert.doesNotMatch(String(shrunkToolMessage?.content ?? ""), /ROUND1-LARGE-ONE::/);
});

test("runtime context externalizes only large tool results while small results stay inline", { concurrency: false }, async (t) => {
  const root = await createTempWorkspace("round1-multi", t);
  const sessionStore = new SessionStore(path.join(root, "sessions"));
  const session = await sessionStore.create(root);
  const requests: FakeOpenAiRequest[] = [];

  const server = await startFakeOpenAiServer((request) => {
    requests.push(request);
    if (requests.length === 1) {
      return toolCallsResponse([
        {
          name: "emit_large_one",
          args: {},
        },
        {
          name: "emit_small",
          args: {},
        },
        {
          name: "emit_large_two",
          args: {},
        },
      ]);
    }

    return textResponse("Finished after using all stored outputs.");
  });
  t.after(async () => {
    await server.close();
  });

  const result = await runManagedAgentTurn({
    input: "Use multiple large tool results, but keep the bag light.",
    cwd: root,
    config: {
      ...createTestRuntimeConfig(root),
      baseUrl: server.baseUrl,
      yieldAfterToolSteps: 4,
    },
    session,
    sessionStore,
    toolRegistry: createRound1ToolRegistry(),
    identity: RUNTIME_TEST_IDENTITY,
  });

  assert.equal(result.yielded, false);
  assert.ok(requests.length >= 2);

  const continuationRequest = requests.slice(1).find((request) =>
    request.messages.some((message) => message.role === "tool"),
  );
  assert.ok(continuationRequest);

  const continuedToolMessages = continuationRequest?.messages.filter((message) => message.role === "tool") ?? [];
  assert.equal(continuedToolMessages.length, 3);
  assert.match(String(continuedToolMessages[0]?.content ?? ""), /"externalized"\s*:\s*true/);
  assert.equal(String(continuedToolMessages[1]?.content ?? "").includes("small inline result"), true);
  assert.match(String(continuedToolMessages[2]?.content ?? ""), /"externalized"\s*:\s*true/);
  assert.doesNotMatch(String(continuedToolMessages[0]?.content ?? ""), /ROUND1-LARGE-ONE::/);
  assert.doesNotMatch(String(continuedToolMessages[2]?.content ?? ""), /ROUND1-LARGE-TWO::/);

  const built = buildRequestContext("system", result.session.messages, {
    contextWindowMessages: 10,
    model: "deepseek-reasoner",
    maxContextChars: 10_000,
    contextSummaryChars: 1_600,
  });
  assert.ok(built.estimatedChars <= 10_000);
  assert.equal(
    built.messages.filter(
      (message) => message.role === "tool" && /"externalized"\s*:\s*true/.test(String(message.content ?? "")),
    ).length,
    2,
  );
});

function splitPromptLayers(prompt: string): {
  staticLayer: string;
  dynamicLayer: string;
} {
  const marker = "\n\nDynamic runtime layer:\n";
  const index = prompt.indexOf(marker);
  assert.notEqual(index, -1, "Prompt should expose a distinct dynamic runtime layer marker.");
  return {
    staticLayer: prompt.slice(0, index),
    dynamicLayer: prompt.slice(index + marker.length),
  };
}

interface FakeOpenAiRequest {
  messages: Array<{
    role?: string;
    content?: unknown;
  }>;
  toolNames: string[];
}

interface FakeToolCall {
  name: string;
  args: Record<string, unknown>;
}

interface FakeOpenAiResponse {
  kind: "text" | "tool";
  content?: string;
  toolCalls?: FakeToolCall[];
}

function textResponse(content: string): FakeOpenAiResponse {
  return {
    kind: "text",
    content,
  };
}

function toolCallsResponse(toolCalls: FakeToolCall[]): FakeOpenAiResponse {
  return {
    kind: "tool",
    toolCalls,
  };
}

async function startFakeOpenAiServer(
  respond: (request: FakeOpenAiRequest) => FakeOpenAiResponse,
): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/chat/completions") {
      response.writeHead(404).end();
      return;
    }

    const rawBody = await readRequestBody(request);
    const payload = JSON.parse(rawBody) as {
      messages?: Array<{
        role?: string;
        content?: unknown;
      }>;
      tools?: Array<{
        function?: {
          name?: string;
        };
      }>;
    };
    const next = respond({
      messages: payload.messages ?? [],
      toolNames: Array.isArray(payload.tools)
        ? payload.tools
          .map((tool) => String(tool.function?.name ?? "").trim())
          .filter(Boolean)
        : [],
    });

    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
    });

    if (next.kind === "tool") {
      response.write(
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: (next.toolCalls ?? []).map((toolCall, index) => ({
                  index,
                  id: `tool-${Date.now()}-${index}`,
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
      response.write(
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                content: next.content,
              },
            },
          ],
        })}\n\n`,
      );
    }

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
    close: () =>
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

function createRound1ToolRegistry(): ToolRegistry {
  return {
    definitions: [
      createFunctionTool("emit_large_one"),
      createFunctionTool("emit_large_two"),
      createFunctionTool("emit_small"),
    ],
    async execute(name) {
      switch (name) {
        case "emit_large_one":
          return okResult(buildLargeToolOutput(LARGE_MARKER_ONE));
        case "emit_large_two":
          return okResult(buildLargeToolOutput(LARGE_MARKER_TWO));
        case "emit_small":
          return {
            ok: true,
            output: SMALL_RESULT,
          };
        default:
          throw new Error(`Unexpected tool: ${name}`);
      }
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
  return {
    ok: true,
    output,
    metadata,
  };
}

function buildLargeToolOutput(marker: string): string {
  return JSON.stringify(
    {
      ok: true,
      path: "validation/round1-large.txt",
      format: "text",
      content: marker,
      preview: `${marker.slice(0, 160)}...`,
      entries: Array.from({ length: 120 }, (_, index) => ({
        path: `src/file-${index}.ts`,
        type: "file",
      })),
    },
    null,
    2,
  );
}

function parseMessageJson(message: Pick<StoredMessage, "content">): Record<string, unknown> {
  const content = message.content;
  if (typeof content !== "string") {
    throw new Error("Expected message content to be a JSON string.");
  }
  return JSON.parse(content) as Record<string, unknown>;
}

function readStoragePath(payload: Record<string, unknown>): string | undefined {
  const storagePath = payload.storagePath;
  return typeof storagePath === "string" && storagePath.length > 0 ? storagePath : undefined;
}

function resolveArtifactPath(root: string, artifactPath: string): string {
  if (path.isAbsolute(artifactPath)) {
    return artifactPath;
  }

  const candidates = [
    path.join(root, artifactPath),
    path.join(process.cwd(), artifactPath),
  ];

  const resolved = candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
  if (!resolved) {
    throw new Error(`Could not resolve artifact path for ${artifactPath}`);
  }

  return resolved;
}
