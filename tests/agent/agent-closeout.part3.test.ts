import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { filterToolDefinitionsForCloseout } from "../../src/agent/turn.js";
import { handleCompletedAssistantResponse } from "../../src/agent/turn.js";
import { runAgentTurn } from "../../src/agent/runTurn.js";
import { MemorySessionStore } from "../../src/agent/session.js";
import { createEmptyVerificationState, markVerificationRequired, recordVerificationAttempt } from "../../src/agent/verification.js";
import { getLightweightVerificationAttempt } from "../../src/agent/verification.js";
import type { RunTurnOptions } from "../../src/agent/types.js";
import type { FunctionToolDefinition, ToolRegistry } from "../../src/capabilities/tools/index.js";
import type { ToolExecutionResult } from "../../src/types.js";
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

function createCloseoutTestRegistry(root: string, executedTools: string[]): ToolRegistry {
  return {
    definitions: [
      createFunctionTool("todo_write"),
      createFunctionTool("write_target"),
      createFunctionTool("verify_target"),
      createFunctionTool("task_list"),
      createFunctionTool("task_get", {
        task_id: {
          type: "number",
        },
      }, ["task_id"]),
      createFunctionTool("task_update", {
        task_id: {
          type: "number",
        },
        status: {
          type: "string",
        },
      }, ["task_id"]),
    ],
    async execute(name, rawArgs) {
      executedTools.push(name);
      const args = rawArgs ? JSON.parse(rawArgs) as Record<string, unknown> : {};
      switch (name) {
        case "todo_write":
          return okResult({
            ok: true,
            items: args.items,
          });
        case "write_target": {
          const relativePath = String(args.path ?? "");
          const absolutePath = path.join(root, relativePath);
          await fs.mkdir(path.dirname(absolutePath), { recursive: true });
          await fs.writeFile(absolutePath, String(args.content ?? ""), "utf8");
          return okResult(
            {
              ok: true,
              path: relativePath,
            },
            {
              changedPaths: [relativePath],
            },
          );
        }
        case "verify_target":
          return okResult(
            {
              ok: true,
              command: "npm test",
            },
            {
              verification: {
                attempted: true,
                command: "npm test",
                exitCode: 0,
                kind: "test",
                passed: true,
              },
            },
          );
        case "task_list":
          return okResult({
            ok: true,
            tasks: [],
          });
        case "task_get":
          return okResult({
            ok: true,
            task: {
              id: args.task_id,
            },
          });
        case "task_update":
          return okResult({
            ok: true,
            task: {
              id: args.task_id,
              status: args.status,
            },
          });
        default:
          throw new Error(`Unexpected tool: ${name}`);
      }
    },
  };
}

function createFunctionTool(
  name: string,
  properties: Record<string, unknown> = {},
  required: string[] = [],
): FunctionToolDefinition {
  return {
    type: "function",
    function: {
      name,
      description: `${name} test tool`,
      parameters: {
        type: "object",
        properties,
        required,
        additionalProperties: false,
      },
    },
  };
}

function okResult(
  payload: Record<string, unknown>,
  metadata?: ToolExecutionResult["metadata"],
): ToolExecutionResult {
  return {
    ok: true,
    output: JSON.stringify(payload, null, 2),
    metadata,
  };
}

test("getLightweightVerificationAttempt matches persisted absolute pending paths after continuation", () => {
  const attempt = getLightweightVerificationAttempt({
    toolName: "read_file",
    rawArgs: JSON.stringify({ path: TARGET_FILE }),
    pendingPaths: ["C:\\Users\\Administrator\\Desktop\\deadmouse\\validation\\helldivers2-latest.md"],
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
    pendingPaths: ["src/agent/runTurn.ts"],
    resultOk: true,
  });

  assert.equal(attempt, null);
});

test("filterToolDefinitionsForCloseout still hides task board tools after continuation keeps pendingPaths", async () => {
  const sessionStore = new MemorySessionStore();
  const baseSession = await sessionStore.create(process.cwd());
  const session = await sessionStore.save({
    ...baseSession,
    todoItems: [
      { id: "1", text: "Summarize the article", status: "completed" },
      { id: "2", text: "Write the file", status: "completed" },
      { id: "3", text: "Verify the file", status: "pending" },
    ],
    verificationState: {
      ...(baseSession.verificationState ?? createEmptyVerificationState()),
      status: "required",
      attempts: 0,
      reminderCount: 0,
      pendingPaths: ["C:\\Users\\Administrator\\Desktop\\deadmouse\\validation\\helldivers2-latest.md"],
    },
  });

  const filtered = filterToolDefinitionsForCloseout(createCloseoutTestRegistry(process.cwd(), []).definitions, {
    session,
    changedPaths: new Set<string>(),
    hasSubstantiveToolActivity: false,
    verificationState: session.verificationState,
  });

  const toolNames = filtered.map((tool) => tool.function.name);
  assert.equal(toolNames.includes("task_list"), false);
  assert.equal(toolNames.includes("task_get"), false);
  assert.equal(toolNames.includes("task_update"), false);
});

test("filterToolDefinitionsForCloseout does not hide tools during ordinary execution", async () => {
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(process.cwd());
  const definitions = createCloseoutTestRegistry(process.cwd(), []).definitions;

  const filtered = filterToolDefinitionsForCloseout(definitions, {
    session,
    changedPaths: new Set<string>(),
    hasSubstantiveToolActivity: false,
    verificationState: session.verificationState,
  });

  assert.deepEqual(
    filtered.map((tool) => tool.function.name),
    definitions.map((tool) => tool.function.name),
  );
});
