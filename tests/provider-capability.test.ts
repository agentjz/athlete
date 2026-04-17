import assert from "node:assert/strict";
import test from "node:test";

import type { FunctionToolDefinition } from "../src/tools/index.js";
import {
  resolveProviderCapabilities,
  selectProviderRequestModel,
} from "../src/agent/provider.js";
import { buildProviderRequestBody } from "../src/agent/provider/chatRequestBody.js";

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

test("provider capabilities own tool fallback and recovery model selection outside the kernel", () => {
  const deepseek = resolveProviderCapabilities({
    provider: "deepseek",
    model: "deepseek-reasoner",
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
  assert.equal(deepseek.toolCompatibilityFallbackModel, "deepseek-chat");
  assert.equal(deepseek.wireApi, "chat.completions");
  assert.equal(generic.wireApi, "chat.completions");
  assert.equal(generic.toolCompatibilityFallbackModel, undefined);

  assert.equal(
    selectProviderRequestModel({
      provider: "deepseek",
      configuredModel: "deepseek-reasoner",
      consecutiveFailures: 6,
    }),
    "deepseek-chat",
  );
  assert.equal(
    selectProviderRequestModel({
      provider: "openai-compatible",
      configuredModel: "gpt-4.1",
      consecutiveFailures: 6,
    }),
    "gpt-4.1",
  );
});

test("buildProviderRequestBody derives provider-specific reasoning behavior from capabilities instead of kernel branches", () => {
  const deepseekBody = buildProviderRequestBody({
    provider: "deepseek",
    model: "deepseek-chat",
    messages: [{ role: "user", content: "Inspect README.md" }],
    tools: [createTool()],
    stream: false,
    forceReasoning: false,
  });
  const genericBody = buildProviderRequestBody({
    provider: "openai-compatible",
    model: "gpt-4.1",
    messages: [{ role: "user", content: "Inspect README.md" }],
    tools: [createTool()],
    stream: false,
    forceReasoning: false,
  });

  assert.equal(deepseekBody.model, "deepseek-chat");
  assert.deepEqual(deepseekBody.thinking, { type: "enabled" });
  assert.equal("thinking" in genericBody, false);
});
