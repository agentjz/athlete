import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { filterToolDefinitionsForCloseout } from "../src/agent/turn.js";
import { handleCompletedAssistantResponse } from "../src/agent/turn.js";
import { runAgentTurn } from "../src/agent/runTurn.js";
import { MemorySessionStore } from "../src/agent/session.js";
import { createEmptyVerificationState, markVerificationRequired, recordVerificationAttempt } from "../src/agent/verification.js";
import { getLightweightVerificationAttempt } from "../src/agent/verification.js";
import type { RunTurnOptions } from "../src/agent/types.js";
import type { FunctionToolDefinition, ToolRegistry } from "../src/tools/index.js";
import type { ToolExecutionResult } from "../src/types.js";
import { createCheckpointFixture, createTempWorkspace, createTestRuntimeConfig } from "./helpers.js";

const TARGET_FILE = "validation/helldivers2-latest.md";

test("handleCompletedAssistantResponse finalizes once verified work is done even if prior todos are stale", async () => {
  const sessionStore = new MemorySessionStore();
  const baseSession = await sessionStore.create(process.cwd());
  const session = await sessionStore.save(({
    ...baseSession,
    checkpoint: createCheckpointFixture("Finish the task", {
      completedSteps: ["Wrote the report"],
      currentStep: "Running final verification",
      nextStep: "Finalize the response",
    }),
    todoItems: [
      { id: "1", text: "Write the report", status: "completed" },
      { id: "2", text: "Verify the report", status: "completed" },
      { id: "3", text: "Update the checklist", status: "pending" },
    ],
    verificationState: recordVerificationAttempt(
      markVerificationRequired(createEmptyVerificationState()),
      {
        attempted: true,
        command: "npm test",
        exitCode: 0,
        kind: "test",
        passed: true,
      },
    ),
  }) as any);

  const outcome = await handleCompletedAssistantResponse({
    session,
    response: {
      content: "Wrote the file, verified it, and the task is complete.",
      toolCalls: [],
    },
    identity: {
      kind: "lead",
      name: "lead",
    },
    changedPaths: new Set([TARGET_FILE]),
    hadIncompleteTodosAtStart: true,
    hasSubstantiveToolActivity: true,
    verificationState: session.verificationState,
    validationReminderInjected: false,
    options: {
      input: "Finish the task",
      cwd: process.cwd(),
      config: createTestRuntimeConfig(process.cwd()),
      session,
      sessionStore,
    } as RunTurnOptions,
  });

  assert.equal(outcome.kind, "return");
  if (outcome.kind === "return") {
    assert.equal(outcome.result.verificationPassed, true);
    assert.equal(outcome.result.paused, false);
    assert.equal(outcome.result.transition?.reason.code, "finalize.completed");
    assert.equal((outcome.result.session as any).checkpoint?.status, "completed");
    assert.equal((outcome.result.session as any).checkpoint?.nextStep, undefined);
    assert.equal((outcome.result.session as any).checkpoint?.flow?.lastTransition?.reason?.code, "finalize.completed");
  }
});

test("handleCompletedAssistantResponse auto-verifies a lightweight validation markdown before finalizing", async (t) => {
  const root = await createTempWorkspace("closeout-autoverify", t);
  const targetPath = path.join(root, TARGET_FILE);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, "# Verified output\n- item\n", "utf8");

  const sessionStore = new MemorySessionStore();
  const baseSession = await sessionStore.create(root);
  const session = await sessionStore.save({
    ...baseSession,
    todoItems: [
      { id: "1", text: "Research", status: "completed" },
      { id: "2", text: "Write file", status: "completed" },
    ],
    verificationState: {
      ...(baseSession.verificationState ?? createEmptyVerificationState()),
      status: "required",
      attempts: 0,
      reminderCount: 0,
      noProgressCount: 0,
      pendingPaths: [targetPath],
    },
  });

  const outcome = await handleCompletedAssistantResponse({
    session,
    response: {
      content: "Finished the requested markdown summary.",
      toolCalls: [],
    },
    identity: {
      kind: "lead",
      name: "lead",
    },
    changedPaths: new Set([targetPath]),
    hadIncompleteTodosAtStart: true,
    hasSubstantiveToolActivity: true,
    verificationState: session.verificationState,
    validationReminderInjected: false,
    options: {
      input: "Finish the task",
      cwd: root,
      config: createTestRuntimeConfig(root),
      session,
      sessionStore,
    } as RunTurnOptions,
  });

  assert.equal(outcome.kind, "return");
  if (outcome.kind === "return") {
    assert.equal(outcome.result.verificationAttempted, true);
    assert.equal(outcome.result.verificationPassed, true);
    assert.equal(outcome.result.paused, false);
    assert.equal(outcome.result.transition?.reason.code, "finalize.completed");
    assert.equal((outcome.result.transition as any)?.reason?.verificationKind, "auto_readback");
  }
});

test("handleCompletedAssistantResponse auto-verifies lightweight markdown outputs even after reminders already paused verification", async (t) => {
  const root = await createTempWorkspace("closeout-autoverify-paused", t);
  const targetPath = path.join(root, TARGET_FILE);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, "# Verified output\n- item\n", "utf8");

  const sessionStore = new MemorySessionStore();
  const baseSession = await sessionStore.create(root);
  const session = await sessionStore.save({
    ...baseSession,
    todoItems: [
      { id: "1", text: "Research", status: "completed" },
      { id: "2", text: "Write file", status: "completed" },
    ],
    verificationState: {
      ...(baseSession.verificationState ?? createEmptyVerificationState()),
      status: "awaiting_user",
      attempts: 0,
      reminderCount: 3,
      noProgressCount: 0,
      pendingPaths: [targetPath],
      pauseReason: "Verification was requested repeatedly, but no targeted verification command was produced.",
    },
  });

  const outcome = await handleCompletedAssistantResponse({
    session,
    response: {
      content: "Finished the requested markdown summary.",
      toolCalls: [],
    },
    identity: {
      kind: "lead",
      name: "lead",
    },
    changedPaths: new Set([targetPath]),
    hadIncompleteTodosAtStart: true,
    hasSubstantiveToolActivity: true,
    verificationState: session.verificationState,
    validationReminderInjected: false,
    options: {
      input: "Finish the task",
      cwd: root,
      config: createTestRuntimeConfig(root),
      session,
      sessionStore,
    } as RunTurnOptions,
  });

  assert.equal(outcome.kind, "return");
  if (outcome.kind === "return") {
    assert.equal(outcome.result.verificationAttempted, true);
    assert.equal(outcome.result.verificationPassed, true);
    assert.equal(outcome.result.paused, false);
    assert.equal(outcome.result.transition?.reason.code, "finalize.completed");
  }
});

test("handleCompletedAssistantResponse exposes structured verification transitions when finalize is blocked", async () => {
  const sessionStore = new MemorySessionStore();
  const baseSession = await sessionStore.create(process.cwd());
  const pendingPath = path.join(process.cwd(), "src", "agent", "runTurn.ts");

  const requiredSession = await sessionStore.save({
    ...baseSession,
    verificationState: {
      ...(baseSession.verificationState ?? createEmptyVerificationState()),
      status: "required",
      attempts: 0,
      reminderCount: 0,
      noProgressCount: 0,
      pendingPaths: [pendingPath],
    },
  });

  const continueOutcome = await handleCompletedAssistantResponse({
    session: requiredSession,
    response: {
      content: "Finished the change.",
      toolCalls: [],
    },
    identity: {
      kind: "lead",
      name: "lead",
    },
    changedPaths: new Set([pendingPath]),
    hadIncompleteTodosAtStart: false,
    hasSubstantiveToolActivity: true,
    verificationState: requiredSession.verificationState,
    validationReminderInjected: false,
    options: {
      input: "Finish the change",
      cwd: process.cwd(),
      config: createTestRuntimeConfig(process.cwd()),
      session: requiredSession,
      sessionStore,
    } as RunTurnOptions,
  });

  assert.equal(continueOutcome.kind, "continue");
  if (continueOutcome.kind === "continue") {
    assert.equal(continueOutcome.transition.reason.code, "continue.verification_required");
    assert.equal((continueOutcome.session as any).checkpoint?.flow?.lastTransition?.reason?.code, "continue.verification_required");
  }

  const awaitingUserSession = await sessionStore.save({
    ...baseSession,
    verificationState: {
      ...(baseSession.verificationState ?? createEmptyVerificationState()),
      status: "awaiting_user",
      attempts: 3,
      reminderCount: 3,
      noProgressCount: 2,
      pendingPaths: [pendingPath],
      pauseReason: "Verification is paused until the user clarifies the desired check.",
    },
  });

  const pausedOutcome = await handleCompletedAssistantResponse({
    session: awaitingUserSession,
    response: {
      content: "Finished the change.",
      toolCalls: [],
    },
    identity: {
      kind: "lead",
      name: "lead",
    },
    changedPaths: new Set([pendingPath]),
    hadIncompleteTodosAtStart: false,
    hasSubstantiveToolActivity: true,
    verificationState: awaitingUserSession.verificationState,
    validationReminderInjected: false,
    options: {
      input: "Finish the change",
      cwd: process.cwd(),
      config: createTestRuntimeConfig(process.cwd()),
      session: awaitingUserSession,
      sessionStore,
    } as RunTurnOptions,
  });

  assert.equal(pausedOutcome.kind, "return");
  if (pausedOutcome.kind === "return") {
    assert.equal(pausedOutcome.result.paused, true);
    assert.equal(pausedOutcome.result.transition?.reason.code, "pause.verification_awaiting_user");
    assert.equal((pausedOutcome.result.session as any).checkpoint?.flow?.lastTransition?.reason?.code, "pause.verification_awaiting_user");
  }
});

test("runAgentTurn stops after the terminal todo_write instead of repeating closeout writes", async (t) => {
  const root = await createTempWorkspace("closeout-todo", t);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);
  const executedTools: string[] = [];
  const seenToolSets: string[][] = [];

  const server = await startFakeOpenAiServer((request) => {
    seenToolSets.push(request.toolNames);
    switch (seenToolSets.length) {
      case 1:
        return toolCallResponse("todo_write", {
          items: [
            { id: "1", text: "Write the file", status: "in_progress" },
            { id: "2", text: "Verify the file", status: "pending" },
          ],
        });
      case 2:
        return toolCallResponse("write_target", {
          path: TARGET_FILE,
          content: [
            "# Helldivers 2 latest public news",
            "- Arrowhead shared a new major order update.",
            "- Community patch notes were summarized.",
          ].join("\n"),
        });
      case 3:
        return toolCallResponse("verify_target", {});
      case 4:
        return request.toolNames.includes("todo_write")
          ? toolCallResponse("todo_write", {
              items: [
                { id: "1", text: "Write the file", status: "completed" },
                { id: "2", text: "Verify the file", status: "completed" },
              ],
            })
          : textResponse("Finished and verified.");
      case 5:
        return request.toolNames.includes("todo_write")
          ? toolCallResponse("todo_write", {
              items: [
                { id: "1", text: "Write the file", status: "completed" },
                { id: "2", text: "Verify the file", status: "completed" },
              ],
            })
          : textResponse("Finished and verified.");
      default:
        return textResponse("Finished and verified.");
    }
  });
  t.after(async () => {
    await server.close();
  });

  const result = await runAgentTurn({
    input: "Please write the latest public Helldivers 2 news summary to validation/helldivers2-latest.md.",
    cwd: root,
    config: {
      ...createTestRuntimeConfig(root),
      baseUrl: server.baseUrl,
      yieldAfterToolSteps: 12,
    },
    session,
    sessionStore,
    toolRegistry: createCloseoutTestRegistry(root, executedTools),
  });

  assert.equal(result.yielded, false);
  assert.equal(result.verificationPassed, true);
  assert.deepEqual(executedTools, [
    "todo_write",
    "write_target",
    "verify_target",
    "todo_write",
  ]);
  assert.equal(seenToolSets.at(-1)?.includes("todo_write"), false);
  assert.match(await fs.readFile(path.join(root, TARGET_FILE), "utf8"), /Helldivers 2 latest public news/);
});

test("runAgentTurn does not spin through task_list, task_get, and task_update after verified completion", async (t) => {
  const root = await createTempWorkspace("closeout-tasks", t);
  const sessionStore = new MemorySessionStore();
  const session = await sessionStore.create(root);
  const executedTools: string[] = [];
  const seenToolSets: string[][] = [];

  const server = await startFakeOpenAiServer((request) => {
    seenToolSets.push(request.toolNames);
    switch (seenToolSets.length) {
      case 1:
        return toolCallResponse("todo_write", {
          items: [
            { id: "1", text: "Write the file", status: "in_progress" },
            { id: "2", text: "Verify the file", status: "pending" },
          ],
        });
      case 2:
        return toolCallResponse("write_target", {
          path: TARGET_FILE,
          content: "# Latest Helldivers 2 news\n- Summary complete.\n",
        });
      case 3:
        return toolCallResponse("verify_target", {});
      case 4:
        return request.toolNames.includes("task_list")
          ? toolCallResponse("task_list", {})
          : textResponse("Finished and verified.");
      case 5:
        return request.toolNames.includes("task_get")
          ? toolCallResponse("task_get", { task_id: 1 })
          : textResponse("Finished and verified.");
      case 6:
        return request.toolNames.includes("task_update")
          ? toolCallResponse("task_update", { task_id: 1, status: "completed" })
          : textResponse("Finished and verified.");
      case 7:
        return textResponse("Finished and verified.");
      case 8:
        return request.toolNames.includes("todo_write")
          ? toolCallResponse("todo_write", {
              items: [
                { id: "1", text: "Write the file", status: "completed" },
                { id: "2", text: "Verify the file", status: "completed" },
              ],
            })
          : textResponse("Finished and verified.");
      default:
        return textResponse("Finished and verified.");
    }
  });
  t.after(async () => {
    await server.close();
  });

  const result = await runAgentTurn({
    input: "Please write the latest public Helldivers 2 news summary to validation/helldivers2-latest.md.",
    cwd: root,
    config: {
      ...createTestRuntimeConfig(root),
      baseUrl: server.baseUrl,
      yieldAfterToolSteps: 16,
    },
    session,
    sessionStore,
    toolRegistry: createCloseoutTestRegistry(root, executedTools),
  });

  assert.equal(result.yielded, false);
  assert.equal(result.verificationPassed, true);
  assert.deepEqual(executedTools, [
    "todo_write",
    "write_target",
    "verify_target",
  ]);
  assert.equal(
    ["task_list", "task_get", "task_update"].some((toolName) => seenToolSets.at(-1)?.includes(toolName)),
    false,
  );
});

test("getLightweightVerificationAttempt treats a targeted read_file of a written validation markdown as passed verification", () => {
  const attempt = getLightweightVerificationAttempt({
    toolName: "read_file",
    rawArgs: JSON.stringify({ path: TARGET_FILE }),
    pendingPaths: [TARGET_FILE],
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
