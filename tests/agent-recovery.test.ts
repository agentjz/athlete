import assert from "node:assert/strict";
import test from "node:test";

import { fetchAssistantResponse } from "../src/agent/api.js";
import { withApiRetries } from "../src/agent/turn.js";
import type { FunctionToolDefinition } from "../src/tools/index.js";

test("fetchAssistantResponse does not revive legacy DeepSeek chat fallback when V4 tool use is rejected", async () => {
  const seenRequests: string[] = [];
  const client = {
    chat: {
      completions: {
        create: async (body: Record<string, unknown>) => {
          const model = String(body.model ?? "");
          const stream = body.stream === true;
          seenRequests.push(`${model}:${stream ? "stream" : "nonstream"}`);

          if (model === "deepseek-v4-flash") {
            const error = new Error("This model does not support tools.");
            (error as Error & { status?: number }).status = 400;
            throw error;
          }

          if (stream) {
            throw new Error("Streaming disabled in test.");
          }

          return {
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: "call-1",
                      type: "function",
                      function: {
                        name: "read_file",
                        arguments: "{\"path\":\"README.md\"}",
                      },
                    },
                  ],
                },
              },
            ],
          };
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

  await assert.rejects(
    () => fetchAssistantResponse(
      client as any,
      [{ role: "user", content: "Inspect README.md" }],
      {
        provider: "deepseek",
        model: "deepseek-v4-flash",
      },
      tools,
      undefined,
    ),
    /does not support tools/,
  );

  assert.deepEqual(seenRequests, [
    "deepseek-v4-flash:stream",
    "deepseek-v4-flash:nonstream",
  ]);
});

test("fetchAssistantResponse marks assistant text as streamed when content arrived through streaming deltas", async () => {
  const client = {
    chat: {
      completions: {
        create: async (body: Record<string, unknown>) => {
          if (body.stream !== true) {
            throw new Error("Non-streaming fallback should not run in this test.");
          }

          return {
            controller: new AbortController(),
            async *[Symbol.asyncIterator]() {
              yield {
                choices: [
                  {
                    delta: {
                      content: "hello ",
                    },
                  },
                ],
              };
              yield {
                choices: [
                  {
                    delta: {
                      content: "world",
                    },
                  },
                ],
              };
            },
          };
        },
      },
    },
  };

  const response = await fetchAssistantResponse(
    client as any,
    [{ role: "user", content: "Say hello." }],
    {
      provider: "deepseek",
      model: "deepseek-v4-flash",
    },
    undefined,
    undefined,
  );

  assert.equal(response.content, "hello world");
  assert.equal(response.streamedAssistantContent, true);
});

test("withApiRetries retries transient failures and preserves recovery behavior", async () => {
  let attempts = 0;

  const result = await withApiRetries(async () => {
    attempts += 1;
    if (attempts < 3) {
      const error = new Error("network timeout");
      (error as Error & { status?: number }).status = 503;
      throw error;
    }

    return "ok";
  });

  assert.equal(result, "ok");
  assert.equal(attempts, 3);
});
