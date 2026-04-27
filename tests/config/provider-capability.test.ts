import assert from "node:assert/strict";
import test from "node:test";

import type { FunctionToolDefinition } from "../../src/capabilities/tools/index.js";
import { resolveProviderCapabilities } from "../../src/agent/provider.js";
import { buildProviderRequestBody } from "../../src/agent/provider/chatRequestBody.js";

function createTool(): FunctionToolDefinition {
  return {
    type: "function",
    function: {
      name: "read_file",
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

test("provider capabilities keep DeepSeek V4 on the chat completions wire without legacy model fallback", () => {
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
  assert.deepEqual(deepseekNonThinkingBody.thinking, { type: "disabled" });
  assert.equal("reasoning_effort" in deepseekNonThinkingBody, false);
  assert.equal("thinking" in genericBody, false);
});

test("buildProviderRequestBody rejects unsupported DeepSeek V4 reasoning efforts instead of silently remapping them", () => {
  assert.throws(
    () =>
      buildProviderRequestBody({
        provider: "deepseek",
        model: "deepseek-v4-flash",
        messages: [{ role: "user", content: "Inspect README.md" }],
        tools: undefined,
        stream: false,
        forceReasoning: false,
        thinking: "enabled",
        reasoningEffort: "xhigh",
      }),
    /DeepSeek V4 reasoning_effort must be high or max/,
  );
});
