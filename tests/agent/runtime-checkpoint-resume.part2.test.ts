import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { buildRequestContext } from "../../src/agent/context.js";
import { normalizeSessionCheckpoint, noteCheckpointToolBatch, noteCheckpointYield } from "../../src/agent/checkpoint.js";
import { createMessage } from "../../src/agent/session.js";
import { runManagedAgentTurn } from "../../src/agent/turn.js";
import { runAgentTurn } from "../../src/agent/runTurn.js";
import { SessionStore } from "../../src/agent/session.js";
import { buildSystemPrompt } from "../../src/agent/systemPrompt.js";
import type { FunctionToolDefinition, ToolRegistry } from "../../src/capabilities/tools/index.js";
import type { ProjectContext, ToolExecutionResult } from "../../src/types.js";
import { createCheckpointFixture, createTempWorkspace, createTestRuntimeConfig, initGitRepo } from "../helpers.js";

const LARGE_MARKER = "ROUND2-CHECKPOINT::" + "C".repeat(24_000);
const RUNTIME_TEST_IDENTITY = {
  kind: "teammate" as const,
  name: "runtime-test",
  role: "checkpoint_verifier",
  teamName: "tests",
};







interface FakeOpenAiResponse {
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
}

async function startFakeOpenAiServer(
  respond: () => FakeOpenAiResponse,
): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/chat/completions") {
      response.writeHead(404).end();
      return;
    }

    await readRequestBody(request);
    const next = respond();

    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
    });

    response.write(
      `data: ${JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: next.toolCalls.map((toolCall, index) => ({
                index,
                id: `tool-${Date.now()}-${index}`,
                function: {
                  name: toolCall.name,
                  arguments: JSON.stringify(toolCall.args),
                },
              })),
            },
          },
        ],
      })}\n\n`,
    );
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

function toolCallsResponse(toolCalls: FakeOpenAiResponse["toolCalls"]): FakeOpenAiResponse {
  return {
    toolCalls,
  };
}

function createRound2ToolRegistry(): ToolRegistry {
  return {
    definitions: [
      createFunctionTool("emit_large_checkpoint"),
    ],
    async execute(name) {
      switch (name) {
        case "emit_large_checkpoint":
          return okResult(
            JSON.stringify(
              {
                ok: true,
                path: "validation/round2-large.txt",
                format: "text",
                content: LARGE_MARKER,
                preview: `${LARGE_MARKER.slice(0, 160)}...`,
                entries: Array.from({ length: 40 }, (_, index) => ({
                  path: `validation/chunk-${index}.md`,
                  type: "file",
                })),
              },
              null,
              2,
            ),
          );
        default:
          throw new Error(`Unexpected tool: ${name}`);
      }
    },
  };
}

function createFunctionTool(name: string): FunctionToolDefinition {
  return {
    type: "function",
    function: {
      name,
      description: `${name} test tool`,
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  };
}

function okResult(output: string, metadata?: ToolExecutionResult["metadata"]): ToolExecutionResult {
  return {
    ok: true,
    output,
    metadata,
  };
}

test("runtime checkpoint reload preserves the current structured transition truth", { concurrency: false }, async (t) => {
  const root = await createTempWorkspace("round2-checkpoint-reload-transition", t);
  const sessionStore = new SessionStore(path.join(root, "sessions"));
  const baseSession = await sessionStore.create(root);
  const timestamp = new Date().toISOString();
  const saved = await sessionStore.save({
    ...baseSession,
    taskState: {
      ...(baseSession.taskState ?? {
        activeFiles: [],
        plannedActions: [],
        completedActions: [],
        blockers: [],
        lastUpdatedAt: timestamp,
      }),
      objective: "Continue the current task.",
      plannedActions: ["Resume validation/round2-resume-summary.md"],
      completedActions: ["Completed the setup phase"],
      lastUpdatedAt: timestamp,
    },
    checkpoint: createCheckpointFixture("Continue the current task.", {
      completedSteps: ["Completed the setup phase"],
      flow: {
        phase: "continuation",
        lastTransition: {
          action: "yield",
          reason: {
            code: "yield.tool_step_limit",
            toolSteps: 5,
            limit: 5,
          },
          timestamp,
        },
      },
      updatedAt: timestamp,
    }),
  } as any);

  const loaded = await sessionStore.load(saved.id);
  const checkpoint = (loaded as any).checkpoint;

  assert.equal(checkpoint?.objective, "Continue the current task.");
  assert.equal(checkpoint?.status, "active");
  assert.equal(checkpoint?.flow?.phase, "continuation");
  assert.equal(checkpoint?.flow?.lastTransition?.reason?.code, "yield.tool_step_limit");
  assert.equal(checkpoint?.flow?.lastTransition?.reason?.toolSteps, 5);
  assert.equal(checkpoint?.completedSteps?.includes("Completed the setup phase"), true);
  assert.ok(Array.isArray(checkpoint?.priorityArtifacts));
});

test("runtime checkpoint exposes only current-objective runtime facts when histories are compressed", { concurrency: false }, () => {
  const root = process.cwd();
  const projectContext: ProjectContext = {
    rootDir: root,
    stateRootDir: root,
    cwd: root,
    instructions: [],
    instructionText: "Always respect the checkpoint.",
    instructionTruncated: false,
    skills: [],
    ignoreRules: [],
  };
  const config = createTestRuntimeConfig(root);
  const checkpoint = createCheckpointFixture("Finish the round2 resume summary.", {
    completedSteps: ["Loaded the persisted setup artifact"],
    flow: {
      phase: "resume",
    },
    priorityArtifacts: [
      {
        kind: "externalized_tool_result",
        toolName: "emit_large_checkpoint",
        storagePath: ".deadmouse/tool-results/session-a/large.json",
        preview: "checkpoint preview",
        label: "stored artifact",
      },
    ],
  });

  const prompt = (buildSystemPrompt as any)(
    root,
    config,
    projectContext,
    {
      objective: "Finish the round2 resume summary.",
      activeFiles: [],
      plannedActions: ["Write validation/round2-resume-summary.md"],
      completedActions: ["Loaded the persisted setup artifact"],
      blockers: [],
      lastUpdatedAt: new Date().toISOString(),
    },
    [
      {
        id: "todo-1",
        text: "Write validation/round2-resume-summary.md",
        status: "pending",
      },
    ],
    {
      status: "idle",
      attempts: 0,
      observedPaths: [],
      updatedAt: new Date().toISOString(),
    },
    {
      taskSummary: "Task board says round2.",
      teamSummary: "No teammates.",
      worktreeSummary: "No worktrees.",
      backgroundSummary: "No background jobs.",
      protocolSummary: "No protocol requests.",
      coordinationPolicySummary: "- plan decisions: locked",
    },
    undefined,
    checkpoint,
  );

  const olderMessages = Array.from({ length: 18 }, (_, index) =>
    index % 2 === 0
      ? createMessage("user", `older-user-${index} ${"U".repeat(1_500)}`)
      : createMessage("assistant", `older-assistant-${index} ${"V".repeat(1_500)}`),
  );

  const built = buildRequestContext(prompt, olderMessages, {
    contextWindowMessages: 14,
    model: config.model,
    maxContextChars: 8_500,
    contextSummaryChars: 1_200,
  });

  assert.equal(built.compressed, true);
  assert.match(String(built.messages[0]?.content ?? ""), /Runtime Facts:/i);
  assert.doesNotMatch(String(built.messages[0]?.content ?? ""), /Loaded the persisted setup artifact/i);
  assert.doesNotMatch(String(built.messages[0]?.content ?? ""), /Write validation\/round2-resume-summary\.md/i);
  assert.doesNotMatch(String(built.messages[0]?.content ?? ""), /\.deadmouse\/tool-results\/session-a\/large\.json/i);
  assert.match(String(built.messages[0]?.content ?? ""), /1 artifact reference\(s\) stored/i);
  assert.doesNotMatch(String(built.messages[0]?.content ?? ""), /Completed actions:/i);
  assert.doesNotMatch(String(built.messages[0]?.content ?? ""), /Current step:/i);
  assert.doesNotMatch(String(built.messages[0]?.content ?? ""), /Next step:/i);
});
