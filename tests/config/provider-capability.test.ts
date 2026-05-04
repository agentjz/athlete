import assert from "node:assert/strict";
import test from "node:test";

import type { FunctionToolDefinition } from "../../src/capabilities/tools/index.js";
import { resolveProviderCapabilities } from "../../src/agent/provider.js";
import { buildProviderRequestBody } from "../../src/agent/provider/chatRequestBody.js";

function createTool(): FunctionToolDefinition {
  return {
    type: "function",
    function: {
      name: "read",
      description: "Read a file.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
          },
        },
      },
    },
  };
}

test("provider capabilities keep DeepSeek V4 on the chat completions wire without model downgrade fallback", () => {
  const deepseek = resolveProviderCapabilities({
    provider: "deepseek",
    model: "deepseek-v4-flash",
  });
  const gpt54 = resolveProviderCapabilities({
    provider: "openai",
    model: "gpt-5.4",
  });
  const generic = resolveProviderCapabilities({
    provider: "openai-compatible",
    model: "gpt-4.1",
  });

  assert.equal(gpt54.wireApi, "responses");
  assert.equal(gpt54.requestTimeoutMs >= 15 * 60 * 1000, true);
  assert.equal(gpt54.doctorProbeTimeoutMs >= 30_000, true);
  assert.equal(deepseek.wireApi, "chat.completions");
  assert.equal(deepseek.defaultReasoningEffort, "high");
  assert.equal(deepseek.modelProfile.tier, "strong");
  assert.equal(deepseek.modelProfile.harnessSurface.reasoningVisibleToHarness, true);
  assert.equal(gpt54.modelProfile.tier, "frontier");
  assert.equal(gpt54.modelProfile.wireApi, "responses");
  assert.equal(gpt54.modelProfile.harnessSurface.preferLowNoiseCapabilitySummary, true);
  assert.equal(generic.wireApi, "chat.completions");
});

test("buildProviderRequestBody derives provider-specific reasoning behavior from capabilities instead of kernel branches", () => {
  const deepseekBody = buildProviderRequestBody({
    provider: "deepseek",
    model: "deepseek-v4-pro",
    messages: [{ role: "user", content: "Inspect README.md" }],
    tools: [createTool()],
    stream: false,
    forceReasoning: false,
    thinking: "enabled",
    reasoningEffort: "max",
    maxOutputTokens: 23_456,
  });
  const deepseekNonThinkingBody = buildProviderRequestBody({
    provider: "deepseek",
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "Inspect README.md" }],
    tools: undefined,
    stream: false,
    forceReasoning: false,
    thinking: "disabled",
    reasoningEffort: "max",
  });
  const genericBody = buildProviderRequestBody({
    provider: "openai-compatible",
    model: "gpt-4.1",
    messages: [{ role: "user", content: "Inspect README.md" }],
    tools: [createTool()],
    stream: false,
    forceReasoning: false,
  });

  assert.equal(deepseekBody.model, "deepseek-v4-pro");
  assert.deepEqual(deepseekBody.thinking, { type: "enabled" });
  assert.equal(deepseekBody.reasoning_effort, "max");
  assert.equal(deepseekBody.max_tokens, 23_456);
  assert.equal("tool_choice" in deepseekBody, false);
  assert.deepEqual(deepseekNonThinkingBody.thinking, { type: "disabled" });
  assert.equal("reasoning_effort" in deepseekNonThinkingBody, false);
  assert.equal("thinking" in genericBody, false);
  assert.equal(genericBody.tool_choice, "auto");
});

test("buildProviderRequestBody replays DeepSeek reasoning_content for included assistant messages", () => {
  const body = buildProviderRequestBody({
    provider: "deepseek",
    model: "deepseek-v4-flash",
    messages: [
      { role: "user", content: "Inspect README.md" },
      {
        role: "assistant",
        content: null,
        reasoningContent: "I need to inspect the file first.",
        toolCalls: [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "read",
              arguments: "{\"path\":\"README.md\"}",
            },
          },
        ],
      },
      { role: "tool", content: "README contents", toolCallId: "call-1" },
      {
        role: "assistant",
        content: "README inspected.",
        reasoningContent: "The tool result is enough to answer.",
      },
    ],
    tools: [createTool()],
    stream: false,
    forceReasoning: false,
    thinking: "enabled",
    reasoningEffort: "high",
  });

  const messages = body.messages as Array<Record<string, unknown>>;
  assert.deepEqual(body.thinking, { type: "enabled" });
  assert.equal(messages[1]?.content, "");
  assert.equal(messages[1]?.reasoning_content, "I need to inspect the file first.");
  assert.equal(messages[3]?.reasoning_content, "The tool result is enough to answer.");
});

test("buildProviderRequestBody keeps DeepSeek thinking when retained text-only assistant messages lack reasoning_content", () => {
  const body = buildProviderRequestBody({
    provider: "deepseek",
    model: "deepseek-v4-flash",
    messages: [
      { role: "user", content: "Inspect README.md" },
      {
        role: "assistant",
        content: "README inspected.",
      },
    ],
    tools: [createTool()],
    stream: false,
    forceReasoning: false,
    thinking: "enabled",
    reasoningEffort: "high",
  });

  assert.deepEqual(body.thinking, { type: "enabled" });
  assert.equal(body.reasoning_effort, "high");
});

test("buildProviderRequestBody disables DeepSeek thinking when retained tool-call assistant messages cannot replay reasoning_content", () => {
  const body = buildProviderRequestBody({
    provider: "deepseek",
    model: "deepseek-v4-flash",
    messages: [
      { role: "user", content: "Inspect README.md" },
      {
        role: "assistant",
        content: null,
        toolCalls: [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "read",
              arguments: "{\"path\":\"README.md\"}",
            },
          },
        ],
      },
      { role: "tool", content: "README contents", toolCallId: "call-1" },
    ],
    tools: [createTool()],
    stream: false,
    forceReasoning: false,
    thinking: "enabled",
    reasoningEffort: "high",
  });

  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.equal("reasoning_effort" in body, false);
});

test("buildProviderRequestBody maps generic effort names onto DeepSeek V4 high or max", () => {
  const lowBody = buildProviderRequestBody({
    provider: "deepseek",
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "Inspect README.md" }],
    tools: undefined,
    stream: true,
    forceReasoning: false,
    thinking: "enabled",
    reasoningEffort: "low",
  });
  const xhighBody = buildProviderRequestBody({
    provider: "deepseek",
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "Inspect README.md" }],
    tools: undefined,
    stream: true,
    forceReasoning: false,
    thinking: "enabled",
    reasoningEffort: "xhigh",
  });

  assert.equal(lowBody.reasoning_effort, "high");
  assert.equal(xhighBody.reasoning_effort, "max");
  assert.deepEqual(lowBody.stream_options, { include_usage: true });
});

