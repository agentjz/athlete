import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { runAgentExecution } from "../../src/execution/workerAgent.js";
import { ExecutionStore } from "../../src/execution/store.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";

test("subagent resource guard does not stop normal work after ten tool calls", async (t) => {
  const root = await createTempWorkspace("subagent-resource-boundary", t);
  await fs.writeFile(path.join(root, "README.md"), "# resource boundary fixture\n", "utf8");
  let requestCount = 0;
  const server = await startFakeOpenAiServer(() => {
    requestCount += 1;
    return requestCount <= 12
      ? toolCallResponse("read_file", { path: "README.md" })
      : textResponse("Subagent completed after extended research.");
  });
  t.after(async () => {
    await server.close();
  });

  const baseConfig = createTestRuntimeConfig(root);
  const config = {
    ...baseConfig,
    yieldAfterToolSteps: 0,
    baseUrl: server.baseUrl,
    agentModels: {
      ...baseConfig.agentModels,
      subagent: {
        ...baseConfig.agentModels.subagent,
        baseUrl: server.baseUrl,
      },
    },
  };
  const store = new ExecutionStore(root);
  const execution = await store.create({
    lane: "agent",
    profile: "subagent",
    launch: "worker",
    requestedBy: "lead",
    actorName: "subagent-resource-boundary",
    actorRole: "explore",
    cwd: root,
    prompt: "Read the same file repeatedly, then report completion.",
    worktreePolicy: "none",
  });

  await runAgentExecution(root, config, execution);

  const reloaded = await store.load(execution.id);
  assert.equal(requestCount > 10, true);
  assert.equal(reloaded.status, "paused");
  assert.equal(reloaded.statusDetail, undefined);
  assert.equal(/subagent_budget_exhausted/i.test(String(reloaded.output ?? reloaded.pauseReason ?? reloaded.resultText ?? "")), false);
});

test("subagent resource guard returns to lead on execution boundary", async (t) => {
  const root = await createTempWorkspace("subagent-execution-boundary", t);
  const baseConfig = createTestRuntimeConfig(root);
  const server = await startHangingOpenAiServer();
  t.after(async () => {
    await server.close();
  });
  const config = {
    ...baseConfig,
    yieldAfterToolSteps: 0,
    baseUrl: server.baseUrl,
    agentModels: {
      ...baseConfig.agentModels,
      subagent: {
        ...baseConfig.agentModels.subagent,
        baseUrl: server.baseUrl,
      },
    },
  };
  const store = new ExecutionStore(root);
  const execution = await store.create({
    lane: "agent",
    profile: "subagent",
    launch: "worker",
    requestedBy: "lead",
    actorName: "subagent-boundary",
    actorRole: "explore",
    cwd: root,
    prompt: "Keep waiting until the runtime boundary stops this execution.",
    worktreePolicy: "none",
    timeoutMs: 25,
    stallTimeoutMs: 1_000,
  });

  await runAgentExecution(root, config, execution);

  const reloaded = await store.load(execution.id);
  const output = JSON.parse(String(reloaded.output ?? "{}")) as { code?: string; returnTo?: string };
  assert.equal(reloaded.status, "paused");
  assert.equal(reloaded.statusDetail, "execution_boundary_runtime");
  assert.equal(output.code, "execution_boundary_runtime");
  assert.equal(output.returnTo, "lead");
});

interface FakeResponse {
  content?: string;
  toolName?: string;
  toolArgs?: string;
}

async function startHangingOpenAiServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const sockets = new Set<import("node:net").Socket>();
  const server = http.createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/chat/completions") {
      response.writeHead(404).end();
      return;
    }
    request.resume();
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start fake server.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      for (const socket of sockets) {
        socket.destroy();
      }
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

function textResponse(content: string): FakeResponse {
  return { content };
}

function toolCallResponse(toolName: string, args: Record<string, unknown>): FakeResponse {
  return {
    toolName,
    toolArgs: JSON.stringify(args),
  };
}

async function startFakeOpenAiServer(
  handler: () => FakeResponse,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/chat/completions") {
      response.writeHead(404).end();
      return;
    }
    request.resume();
    const fake = handler();
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 0,
      model: "test-model",
      choices: [
        {
          index: 0,
          finish_reason: fake.toolName ? "tool_calls" : "stop",
          message: {
            role: "assistant",
            content: fake.content ?? null,
            tool_calls: fake.toolName
              ? [
                  {
                    id: "call-test",
                    type: "function",
                    function: {
                      name: fake.toolName,
                      arguments: fake.toolArgs ?? "{}",
                    },
                  },
                ]
              : undefined,
          },
        },
      ],
    }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start fake server.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}
