import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { handleCompletedAssistantResponse } from "../../src/agent/turn.js";
import { runAgentTurn } from "../../src/agent/runTurn.js";
import { MemorySessionStore } from "../../src/agent/session.js";
import { recordVerificationAttempt } from "../../src/agent/verification.js";
import { getLightweightVerificationAttempt } from "../../src/agent/verification.js";
import type { RunTurnOptions } from "../../src/agent/types.js";
import { createCheckpointFixture, createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";

const TARGET_FILE = "validation/helldivers2-latest.md";













interface FakeOpenAiRequest {
  toolNames: string[];
}

interface FakeOpenAiResponse {
  kind: "text" | "tool";
  content?: string;
  toolName?: string;
  toolArgs?: string;
}

function textResponse(content: string): FakeOpenAiResponse {
  return {
    kind: "text",
    content,
  };
}

function toolCallResponse(toolName: string, toolArgs: Record<string, unknown>): FakeOpenAiResponse {
  return {
    kind: "tool",
    toolName,
    toolArgs: JSON.stringify(toolArgs),
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
      tools?: Array<{
        function?: {
          name?: string;
        };
      }>;
    };
    const next = respond({
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
                tool_calls: [
                  {
                    index: 0,
                    id: `tool-${Date.now()}`,
                    function: {
                      name: next.toolName,
                      arguments: next.toolArgs,
                    },
                  },
                ],
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

test("getLightweightVerificationAttempt matches persisted absolute observed paths after continuation", () => {
  const attempt = getLightweightVerificationAttempt({
    toolName: "read_file",
    rawArgs: JSON.stringify({ path: TARGET_FILE }),
    observedPaths: ["C:\\Users\\Administrator\\Desktop\\deadmouse\\validation\\helldivers2-latest.md"],
    resultOk: true,
  });

  assert.deepEqual(attempt, {
    attempted: true,
    command: `read_file ${TARGET_FILE}`,
    exitCode: 0,
    kind: "read_file",
    passed: true,
  });
});

test("getLightweightVerificationAttempt does not clear verification for source-code reads", () => {
  const attempt = getLightweightVerificationAttempt({
    toolName: "read_file",
    rawArgs: JSON.stringify({ path: "src/agent/runTurn.ts" }),
    observedPaths: ["src/agent/runTurn.ts"],
    resultOk: true,
  });

  assert.equal(attempt, null);
});
