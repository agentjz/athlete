import assert from "node:assert/strict";
import test from "node:test";

import { probeProviderConnection } from "../../src/agent/provider/connection.js";
import { fetchAssistantResponse } from "../../src/agent/api.js";
import type { FunctionToolDefinition } from "../../src/tools/index.js";

test("doctor provider probe reuses provider base-url candidates and resolves /v1 when the relay exposes OpenAI models there", async () => {
  const requests: string[] = [];
  const diagnosis = await probeProviderConnection({
    provider: "openai",
    model: "gpt-5.4",
    baseUrl: "https://relay.example.test",
    apiKey: "test-key",
    fetchImpl: async (input: unknown, init?: RequestInit) => {
      requests.push(String(input));
      const url = String(input);
      assert.equal((init?.headers as Record<string, string>)?.Authorization, "Bearer test-key");

      if (url === "https://relay.example.test/models") {
        return new Response("missing v1", { status: 404 });
      }

      if (url === "https://relay.example.test/v1/models") {
        return new Response(JSON.stringify({ data: [{ id: "gpt-5.4" }] }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }

      return new Response("unexpected", { status: 500 });
    },
  });

  assert.deepEqual(requests, [
    "https://relay.example.test/models",
    "https://relay.example.test/v1/models",
  ]);
  assert.equal(diagnosis.kind, "ok");
  assert.equal(diagnosis.resolvedBaseUrl, "https://relay.example.test/v1");
  assert.equal(diagnosis.probeTimeoutMs >= 30_000, true);
});

test("fetchAssistantResponse uses the responses adapter for GPT-5.4 instead of falling through chat completions", async () => {
  const seenRequests: string[] = [];
  const client = {
    responses: {
      create: async (body: Record<string, unknown>) => {
        const stream = body.stream === true;
        seenRequests.push(`responses:${stream ? "stream" : "nonstream"}`);

        if (!stream) {
          throw new Error("Non-streaming fallback should not run in this test.");
        }

        return {
          controller: new AbortController(),
          async *[Symbol.asyncIterator]() {
            yield {
              type: "response.output_text.delta",
              item_id: "item-message",
              output_index: 0,
              content_index: 0,
              sequence_number: 1,
              delta: "hello ",
              logprobs: [],
            };
            yield {
              type: "response.output_text.delta",
              item_id: "item-message",
              output_index: 0,
              content_index: 0,
              sequence_number: 2,
              delta: "world",
              logprobs: [],
            };
            yield {
              type: "response.function_call_arguments.delta",
              item_id: "item-call",
              output_index: 1,
              sequence_number: 3,
              delta: "{\"path\":\"",
            };
            yield {
              type: "response.function_call_arguments.delta",
              item_id: "item-call",
              output_index: 1,
              sequence_number: 4,
              delta: "README.md\"}",
            };
            yield {
              type: "response.output_item.done",
              item: {
                id: "item-call",
                type: "function_call",
                call_id: "call-1",
                name: "read_file",
                arguments: "{\"path\":\"README.md\"}",
                status: "completed",
              },
              output_index: 1,
              sequence_number: 5,
            };
          },
        };
      },
    },
    chat: {
      completions: {
        create: async () => {
          throw new Error("chat.completions should not be used for gpt-5.4 responses routing.");
        },
      },
    },
  };

  const tools: FunctionToolDefinition[] = [
    {
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
          required: ["path"],
        },
      },
    },
  ];

  const response = await fetchAssistantResponse(
    client as any,
    [{ role: "user", content: "Inspect README.md" }],
    {
      provider: "openai",
      model: "gpt-5.4",
    },
    tools,
    undefined,
  );

  assert.equal(response.content, "hello world");
  assert.equal(response.toolCalls[0]?.function.name, "read_file");
  assert.equal(response.toolCalls[0]?.function.arguments, "{\"path\":\"README.md\"}");
  assert.deepEqual(seenRequests, ["responses:stream"]);
});

test("fetchAssistantResponse forwards DEADMOUSE_REASONING_EFFORT to responses reasoning.effort", async () => {
  let seenEffort: string | undefined;
  const client = {
    responses: {
      create: async (body: Record<string, unknown>) => {
        const reasoning = body.reasoning as { effort?: string } | undefined;
        seenEffort = reasoning?.effort;
        return {
          controller: new AbortController(),
          async *[Symbol.asyncIterator]() {
            yield {
              type: "response.output_text.delta",
              delta: "done",
            };
          },
        };
      },
    },
    chat: {
      completions: {
        create: async () => {
          throw new Error("chat.completions should not be used for gpt-5.4 responses routing.");
        },
      },
    },
  };

  const response = await fetchAssistantResponse(
    client as any,
    [{ role: "user", content: "Hello" }],
    {
      provider: "openai",
      model: "gpt-5.4",
      reasoningEffort: "low",
    },
    undefined,
    undefined,
  );

  assert.equal(response.content, "done");
  assert.equal(seenEffort, "low");
});
