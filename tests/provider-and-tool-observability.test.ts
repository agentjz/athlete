import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { runManagedAgentTurn } from "../src/agent/turn.js";
import { SessionStore } from "../src/agent/session.js";
import type { FunctionToolDefinition, ToolRegistry } from "../src/tools/index.js";
import { createTestRuntimeConfig, createTempWorkspace } from "./helpers.js";
import { readObservabilityEvents, startFakeChatCompletionServer } from "./observability.helpers.js";

test("tool execution observability records success metadata and failed recovery results with duration", async (t) => {
  const successRoot = await createTempWorkspace("tool-observability-success", t);
  const successSessionStore = new SessionStore(path.join(successRoot, "sessions"));
  const successSession = await successSessionStore.create(successRoot);
  let seenSuccessToolCall = false;
  const successServer = await startFakeChatCompletionServer(async (_payload) => {
    if (!seenSuccessToolCall) {
      seenSuccessToolCall = true;
      return {
        kind: "tool",
        toolCalls: [{
          name: "write_note",
          args: {},
        }],
      };
    }

    return {
      kind: "text",
      content: "finished success path",
    };
  });
  t.after(async () => {
    await successServer.close();
  });

  await runManagedAgentTurn({
    input: "run the success tool",
    cwd: successRoot,
    config: {
      ...createTestRuntimeConfig(successRoot),
      baseUrl: successServer.baseUrl,
    },
    session: successSession,
    sessionStore: successSessionStore,
    toolRegistry: createSingleToolRegistry("write_note", async () => ({
      ok: true,
      output: "note written",
      metadata: {
        changedPaths: ["notes/today.md"],
        verification: {
          attempted: true,
          command: "npm test",
          exitCode: 0,
          passed: true,
          kind: "command",
        },
      },
    })),
  });

  const successEvents = await readObservabilityEvents(successRoot);
  const successToolEvents = successEvents.filter((event) => event.event === "tool.execution");

  assert.deepEqual(
    successToolEvents.map((event) => event.status),
    ["started", "completed"],
  );
  assert.equal(successToolEvents[0]?.toolName, "write_note");
  assert.equal(typeof successToolEvents[1]?.durationMs, "number");
  assert.equal(
    (successToolEvents[1]?.details as Record<string, unknown>)?.changedPathCount,
    1,
  );
  assert.equal(
    (successToolEvents[1]?.details as Record<string, unknown>)?.verificationAttempted,
    true,
  );
  assert.equal(
    (successToolEvents[1]?.details as Record<string, unknown>)?.verificationPassed,
    true,
  );

  const failureRoot = await createTempWorkspace("tool-observability-failure", t);
  const failureSessionStore = new SessionStore(path.join(failureRoot, "sessions"));
  const failureSession = await failureSessionStore.create(failureRoot);
  let seenFailureToolCall = false;
  const failureServer = await startFakeChatCompletionServer(async (_payload) => {
    if (!seenFailureToolCall) {
      seenFailureToolCall = true;
      return {
        kind: "tool",
        toolCalls: [{
          name: "explode_tool",
          args: {},
        }],
      };
    }

    return {
      kind: "text",
      content: "finished failure path",
    };
  });
  t.after(async () => {
    await failureServer.close();
  });

  await runManagedAgentTurn({
    input: "run the failing tool",
    cwd: failureRoot,
    config: {
      ...createTestRuntimeConfig(failureRoot),
      baseUrl: failureServer.baseUrl,
    },
    session: failureSession,
    sessionStore: failureSessionStore,
    toolRegistry: createSingleToolRegistry("explode_tool", async () => {
      throw Object.assign(new Error("tool exploded"), {
        code: "TOOL_BROKEN",
      });
    }),
  });

  const failureEvents = await readObservabilityEvents(failureRoot);
  const failureToolEvents = failureEvents.filter((event) => event.event === "tool.execution");

  assert.deepEqual(
    failureToolEvents.map((event) => event.status),
    ["started", "failed"],
  );
  assert.equal(failureToolEvents[1]?.toolName, "explode_tool");
  assert.equal(typeof failureToolEvents[1]?.durationMs, "number");
  assert.match(String((failureToolEvents[1]?.error as { message?: unknown })?.message ?? ""), /tool exploded/i);
});

test("provider request observability records failed then recovered DeepSeek V4 requests without model fallback", async (t) => {
  const root = await createTempWorkspace("provider-observability-recovery", t);
  const sessionStore = new SessionStore(path.join(root, "sessions"));
  const session = await sessionStore.create(root);
  const requests: string[] = [];
  let attempts = 0;
  const server = await startFakeChatCompletionServer(async (payload) => {
    requests.push(String(payload.model ?? ""));
    attempts += 1;

    if (attempts <= 2) {
      return {
        kind: "error",
        status: 400,
        errorMessage: "content policy risk",
      };
    }

    return {
      kind: "text",
      content: "fallback model recovered",
    };
  });
  t.after(async () => {
    await server.close();
  });

  await runManagedAgentTurn({
    input: "recover from a provider content policy response",
    cwd: root,
    config: {
      ...createTestRuntimeConfig(root),
      baseUrl: server.baseUrl,
      provider: "deepseek",
      model: "deepseek-v4-flash",
    },
    session,
    sessionStore,
    toolRegistry: createSingleToolRegistry("noop_tool", async () => ({
      ok: true,
      output: "noop",
    })),
  });

  const events = await readObservabilityEvents(root);
  const requestEvents = events.filter((event) => event.event === "model.request");

  assert.equal(requests[0], "deepseek-v4-flash");
  assert.equal(requests.at(-1), "deepseek-v4-flash");
  assert.equal(requests.every((model) => model === "deepseek-v4-flash"), true);
  assert.deepEqual(
    requestEvents.map((event) => event.status),
    ["started", "failed", "started", "completed"],
  );
  assert.equal((requestEvents[0]?.details as Record<string, unknown>)?.provider, "deepseek");
  assert.equal(requestEvents[0]?.model, "deepseek-v4-flash");
  assert.equal(
    (requestEvents[1]?.details as Record<string, unknown>)?.recoveryFallback,
    false,
  );
  assert.equal(
    (requestEvents[2]?.details as Record<string, unknown>)?.recoveryFallback,
    true,
  );
  assert.equal(
    (requestEvents[2]?.details as Record<string, unknown>)?.recoveryReason,
    "content_policy",
  );
  assert.equal(
    (requestEvents[2]?.details as Record<string, unknown>)?.configuredModel,
    "deepseek-v4-flash",
  );
  assert.equal(
    (requestEvents[2]?.details as Record<string, unknown>)?.requestModel,
    "deepseek-v4-flash",
  );
  assert.equal(
    (requestEvents[3]?.details as Record<string, unknown>)?.usageAvailable,
    false,
  );
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
