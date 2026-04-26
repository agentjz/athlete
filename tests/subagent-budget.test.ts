import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { runAgentExecution } from "../src/execution/workerAgent.js";
import { ExecutionStore } from "../src/execution/store.js";
import { resolveSubagentBudget } from "../src/subagent/budget.js";
import { createSubagentBudgetExceededReason } from "../src/subagent/budget.js";
import { createSubagentBudgetTracker } from "../src/subagent/budget.js";
import { SubagentBudgetExceededError } from "../src/subagent/errors.js";
import { createTempWorkspace, createTestRuntimeConfig } from "./helpers.js";

test("mode budgets map to fast/balanced/deep defaults", () => {
  const fast = resolveSubagentBudget("fast");
  const balanced = resolveSubagentBudget("balanced");
  const deep = resolveSubagentBudget("deep");

  assert.deepEqual(fast, {
    maxToolCalls: 4,
    maxModelTurns: 3,
    maxElapsedMs: 120_000,
  });
  assert.deepEqual(balanced, {
    maxToolCalls: 10,
    maxModelTurns: 8,
    maxElapsedMs: 360_000,
  });
  assert.deepEqual(deep, {
    maxToolCalls: 20,
    maxModelTurns: 16,
    maxElapsedMs: 900_000,
  });
});

test("F04/F06: budget tracker stops subagent on tool-call or model-turn limit", () => {
  const tracker = createSubagentBudgetTracker(
    {
      maxToolCalls: 2,
      maxModelTurns: 2,
      maxElapsedMs: 5_000,
    },
    () => 1_000,
  );

  tracker.noteModelTurn();
  tracker.noteToolCall("read_file");
  tracker.noteToolCall("search_files");
  const toolExceeded = tracker.noteToolCall("run_shell");
  assert.equal(toolExceeded?.dimension, "tool_calls");

  const anotherTracker = createSubagentBudgetTracker(
    {
      maxToolCalls: 5,
      maxModelTurns: 1,
      maxElapsedMs: 5_000,
    },
    () => 2_000,
  );
  anotherTracker.noteModelTurn();
  const turnExceeded = anotherTracker.noteModelTurn();
  assert.equal(turnExceeded?.dimension, "model_turns");
});

test("F05: budget tracker stops subagent on elapsed wall-clock limit", () => {
  let now = 10_000;
  const tracker = createSubagentBudgetTracker(
    {
      maxToolCalls: 10,
      maxModelTurns: 10,
      maxElapsedMs: 1_000,
    },
    () => now,
  );

  now = 11_500;
  const elapsedExceeded = tracker.evaluate();
  assert.equal(elapsedExceeded?.dimension, "elapsed_ms");
});

test("budget exceeded error is structured and machine-readable", () => {
  const reason = createSubagentBudgetExceededReason(
    "tool_calls",
    {
      toolCalls: 3,
      modelTurns: 1,
      elapsedMs: 900,
      maxToolCalls: 2,
      maxModelTurns: 8,
      maxElapsedMs: 360_000,
    },
  );

  const error = new SubagentBudgetExceededError(reason);
  assert.equal(error.reason.code, "subagent_budget_exhausted");
  assert.equal(error.reason.dimension, "tool_calls");
  assert.match(error.message, /budget/i);
});

test("subagent worker path enforces the fixed budget and returns control to lead", async (t) => {
  const root = await createTempWorkspace("subagent-budget-worker", t);
  await fs.writeFile(path.join(root, "README.md"), "# budget fixture\n", "utf8");
  const server = await startFakeOpenAiServer((requestIndex) =>
    requestIndex <= 6
      ? toolCallResponse("read_file", { path: "README.md" })
      : textResponse("Subagent finished."));
  t.after(async () => {
    await server.close();
  });

  const baseConfig = createTestRuntimeConfig(root);
  const config = {
    ...baseConfig,
    delegationMode: "fast" as const,
    baseUrl: server.baseUrl,
    agentModels: {
      ...baseConfig.agentModels,
      subagent: {
        ...baseConfig.agentModels.subagent,
        baseUrl: server.baseUrl,
      },
    },
  };
  const store = new ExecutionStore(root);
  const execution = await store.create({
    lane: "agent",
    profile: "subagent",
    launch: "worker",
    requestedBy: "lead",
    actorName: "subagent-budget",
    actorRole: "explore",
    cwd: root,
    prompt: "Read the same file repeatedly until the budget stops the execution.",
    worktreePolicy: "none",
  });

  await runAgentExecution(root, config, execution);

  const reloaded = await store.load(execution.id);
  assert.equal(reloaded.status, "paused");
  assert.equal(reloaded.statusDetail, "subagent_budget_exhausted");
  const output = JSON.parse(String(reloaded.output ?? "{}")) as { code?: string; dimension?: string };
  assert.equal(output.code, "subagent_budget_exhausted");
  assert.match(String(output.dimension), /^(tool_calls|model_turns|elapsed_ms)$/);
});

interface FakeResponse {
  content?: string;
  toolName?: string;
  toolArgs?: string;
}

function textResponse(content: string): FakeResponse {
  return { content };
}

function toolCallResponse(toolName: string, args: Record<string, unknown>): FakeResponse {
  return {
    toolName,
    toolArgs: JSON.stringify(args),
  };
}

async function startFakeOpenAiServer(
  respond: (requestIndex: number) => FakeResponse,
): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  let requestIndex = 0;
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/chat/completions") {
      response.writeHead(404).end();
      return;
    }

    for await (const _chunk of request) {
      // Drain the request body.
    }
    requestIndex += 1;
    const next = respond(requestIndex);
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
    });

    if (next.toolName) {
      response.write(
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: `tool-${requestIndex}`,
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
                content: next.content ?? "",
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
