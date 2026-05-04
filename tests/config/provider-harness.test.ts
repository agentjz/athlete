import assert from "node:assert/strict";
import test from "node:test";

import { createScriptedProviderHarness } from "../../src/agent/provider/harness.js";
import type { ProviderAdapterRequest } from "../../src/agent/provider/contract.js";

test("scripted provider harness replays text tool empty and error steps without network calls", async () => {
  const events: string[] = [];
  const metrics: unknown[] = [];
  const harness = createScriptedProviderHarness([
    {
      kind: "text",
      content: "done",
      reasoningContent: "reason",
      usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
    },
    {
      kind: "tool_calls",
      toolCalls: [{ name: "read", arguments: { path: "README.md" } }],
    },
    { kind: "empty" },
    { kind: "error", message: "provider failed" },
  ]);

  const text = await harness.adapter.fetchStreaming({} as never, createRequest({
    callbacks: {
      onAssistantDelta: (delta) => events.push(`delta:${delta}`),
      onAssistantText: (content) => events.push(`text:${content}`),
      onReasoningDelta: (delta) => events.push(`reason-delta:${delta}`),
      onReasoning: (content) => events.push(`reason:${content}`),
    },
    onRequestMetric: (metric) => metrics.push(metric),
  }));
  assert.equal(text.content, "done");
  assert.equal(text.reasoningContent, "reason");
  assert.deepEqual(events, ["reason-delta:reason", "reason:reason", "delta:done", "text:done"]);

  const tool = await harness.adapter.fetchNonStreaming({} as never, createRequest({
    callbacks: {
      onToolCall: (name, args) => events.push(`tool:${name}:${args}`),
    },
  }));
  assert.equal(tool.toolCalls[0]?.function.name, "read");
  assert.equal(tool.toolCalls[0]?.function.arguments, "{\"path\":\"README.md\"}");
  assert.equal(events.at(-1), "tool:read:{\"path\":\"README.md\"}");

  const empty = await harness.adapter.fetchNonStreaming({} as never, createRequest());
  assert.equal(empty.content, null);
  assert.deepEqual(empty.toolCalls, []);

  await assert.rejects(
    () => harness.adapter.fetchNonStreaming({} as never, createRequest()),
    /provider failed/,
  );
  assert.equal(harness.remainingSteps(), 0);
  assert.equal(harness.requests.length, 4);
  assert.deepEqual(metrics, [{ durationMs: 0, usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 } }]);
});

test("scripted provider harness exposes abort behavior as provider abort evidence", async () => {
  const harness = createScriptedProviderHarness([{ kind: "abort", message: "stopped" }]);
  await assert.rejects(
    () => harness.adapter.fetchNonStreaming({} as never, createRequest()),
    /stopped/,
  );
});

function createRequest(overrides: Partial<ProviderAdapterRequest> = {}): ProviderAdapterRequest {
  return {
    provider: "scripted",
    model: "scripted-model",
    messages: [{ role: "user", content: "hello" }],
    tools: undefined,
    callbacks: undefined,
    forceReasoning: false,
    ...overrides,
  };
}

