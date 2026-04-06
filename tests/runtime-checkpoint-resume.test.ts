import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { buildRequestContext } from "../src/agent/contextBuilder.js";
import { normalizeSessionCheckpoint } from "../src/agent/checkpoint.js";
import { createMessage } from "../src/agent/messages.js";
import { runManagedAgentTurn } from "../src/agent/managedTurn.js";
import { runAgentTurn } from "../src/agent/runTurn.js";
import { SessionStore } from "../src/agent/sessionStore.js";
import { buildSystemPrompt } from "../src/agent/systemPrompt.js";
import type { FunctionToolDefinition, ToolRegistry } from "../src/tools/index.js";
import type { ProjectContext, ToolExecutionResult } from "../src/types.js";
import { createCheckpointFixture, createTempWorkspace, createTestRuntimeConfig, initGitRepo } from "./helpers.js";

const LARGE_MARKER = "ROUND2-CHECKPOINT::" + "C".repeat(24_000);
const RUNTIME_TEST_IDENTITY = {
  kind: "teammate" as const,
  name: "runtime-test",
  role: "checkpoint_verifier",
  teamName: "tests",
};

test("runtime checkpoint persists a structured checkpoint after yield and keeps externalized artifact refs", { concurrency: false }, async (t) => {
  const root = await createTempWorkspace("round2-checkpoint-yield", t);
  const sessionStore = new SessionStore(path.join(root, "sessions"));
  const session = await sessionStore.create(root);

  const server = await startFakeOpenAiServer(() =>
    toolCallsResponse([
      {
        name: "emit_large_checkpoint",
        args: {},
      },
    ]));
  t.after(async () => {
    await server.close();
  });

  const result = await runAgentTurn({
    input: "Capture the first checkpoint artifact, then continue from it without restarting.",
    cwd: root,
    config: {
      ...createTestRuntimeConfig(root),
      baseUrl: server.baseUrl,
      yieldAfterToolSteps: 1,
    },
    yieldAfterToolSteps: 1,
    session,
    sessionStore,
    toolRegistry: createRound2ToolRegistry(),
  });

  assert.equal(result.yielded, true);

  const saved = await sessionStore.load(result.session.id);
  const checkpoint = (saved as any).checkpoint;
  const storedToolMessage = saved.messages.find(
    (message) => message.role === "tool" && message.name === "emit_large_checkpoint",
  );
  const storedPayload = storedToolMessage?.content ? JSON.parse(storedToolMessage.content) : null;

  assert.equal(checkpoint?.objective, "Capture the first checkpoint artifact, then continue from it without restarting.");
  assert.equal(checkpoint?.flow?.phase, "continuation");
  assert.equal(Array.isArray(checkpoint?.completedSteps), true);
  assert.equal(typeof checkpoint?.nextStep, "string");
  assert.equal(checkpoint?.recentToolBatch?.tools?.[0], "emit_large_checkpoint");
  assert.match(String(checkpoint?.recentToolBatch?.summary ?? ""), /emit_large_checkpoint/i);
  assert.equal(
    checkpoint?.priorityArtifacts?.some((artifact: Record<string, unknown>) =>
      artifact.toolName === "emit_large_checkpoint" && artifact.storagePath === storedPayload?.storagePath
    ),
    true,
  );
});

test("runtime checkpoint keeps checkpoint state after disk reload when the user says continue", { concurrency: false }, async (t) => {
  const root = await createTempWorkspace("round2-checkpoint-reload", t);
  await initGitRepo(root);
  const sessionStore = new SessionStore(path.join(root, "sessions"));
  const baseSession = await sessionStore.create(root);
  const savedSession = await sessionStore.save({
    ...baseSession,
    taskState: {
      ...(baseSession.taskState ?? {
        activeFiles: [],
        plannedActions: [],
        completedActions: [],
        blockers: [],
        lastUpdatedAt: new Date().toISOString(),
      }),
      objective: "Finish the persisted resume summary.",
      lastUpdatedAt: new Date().toISOString(),
    },
    checkpoint: createCheckpointFixture("Finish the persisted resume summary.", {
      completedSteps: ["Completed the first setup batch"],
      currentStep: "Waiting for session resume",
      nextStep: "Write validation/round2-resume-summary.md without repeating setup.",
      flow: {
        phase: "continuation",
      },
    }),
  } as any);
  const reloaded = await sessionStore.load(savedSession.id);

  let seenSession: any;

  await runManagedAgentTurn({
    input: "continue",
    cwd: root,
    config: createTestRuntimeConfig(root),
    session: reloaded,
    sessionStore,
    identity: RUNTIME_TEST_IDENTITY,
    runSlice: async (options) => {
      seenSession = options.session;
      return {
        session: options.session,
        changedPaths: [],
        verificationAttempted: false,
        yielded: false,
      };
    },
  });

  assert.equal(seenSession?.taskState?.objective, "Finish the persisted resume summary.");
  assert.equal(seenSession?.checkpoint?.objective, "Finish the persisted resume summary.");
  assert.equal(seenSession?.checkpoint?.completedSteps?.includes("Completed the first setup batch"), true);
  assert.equal(
    seenSession?.checkpoint?.nextStep,
    "Write validation/round2-resume-summary.md without repeating setup.",
  );
});

test("runtime checkpoint resets the old checkpoint when the objective changes", { concurrency: false }, async (t) => {
  const root = await createTempWorkspace("round2-checkpoint-reset", t);
  await initGitRepo(root);
  const sessionStore = new SessionStore(path.join(root, "sessions"));
  const baseSession = await sessionStore.create(root);
  const savedSession = await sessionStore.save({
    ...baseSession,
    taskState: {
      ...(baseSession.taskState ?? {
        activeFiles: [],
        plannedActions: [],
        completedActions: [],
        blockers: [],
        lastUpdatedAt: new Date().toISOString(),
      }),
      objective: "Finish the persisted resume summary.",
      lastUpdatedAt: new Date().toISOString(),
    },
    checkpoint: createCheckpointFixture("Finish the persisted resume summary.", {
      completedSteps: ["Completed the first setup batch"],
      currentStep: "Waiting for session resume",
      nextStep: "Write validation/round2-resume-summary.md without repeating setup.",
      recentToolBatch: {
        tools: ["emit_large_checkpoint"],
        summary: "Stored the initial artifact",
        changedPaths: [],
        artifacts: [
          {
            kind: "externalized_tool_result",
            toolName: "emit_large_checkpoint",
            storagePath: ".athlete/tool-results/old.json",
            label: "old artifact",
          },
        ],
        recordedAt: new Date().toISOString(),
      },
    }),
  } as any);
  const reloaded = await sessionStore.load(savedSession.id);
  const normalized = normalizeSessionCheckpoint({
    ...reloaded,
    taskState: {
      ...(reloaded.taskState ?? {
        activeFiles: [],
        plannedActions: [],
        completedActions: [],
        blockers: [],
        lastUpdatedAt: new Date().toISOString(),
      }),
      objective: "Start a brand new PDF extraction task.",
      lastUpdatedAt: new Date().toISOString(),
    },
  });

  assert.equal(normalized.taskState?.objective, "Start a brand new PDF extraction task.");
  assert.equal(normalized.checkpoint?.objective, "Start a brand new PDF extraction task.");
  assert.deepEqual(normalized.checkpoint?.completedSteps ?? [], []);
  assert.equal(normalized.checkpoint?.currentStep, undefined);
  assert.equal(normalized.checkpoint?.recentToolBatch, undefined);
  assert.deepEqual(normalized.checkpoint?.priorityArtifacts ?? [], []);
});

test("runtime checkpoint normalizes missing checkpoint fields from older session files", { concurrency: false }, async (t) => {
  const root = await createTempWorkspace("round2-checkpoint-legacy", t);
  const sessionsDir = path.join(root, "sessions");
  await fs.mkdir(sessionsDir, { recursive: true });

  const legacySessionId = "legacy-round2";
  const timestamp = new Date().toISOString();
  const rawSession = {
    id: legacySessionId,
    createdAt: timestamp,
    updatedAt: timestamp,
    cwd: root,
    messageCount: 1,
    messages: [createMessage("user", "Continue the legacy task.")],
    todoItems: [
      {
        id: "todo-1",
        text: "Resume validation/round2-resume-summary.md",
        status: "pending",
      },
    ],
    taskState: {
      objective: "Continue the legacy task.",
      activeFiles: [],
      plannedActions: ["Resume validation/round2-resume-summary.md"],
      completedActions: ["Completed the setup phase"],
      blockers: [],
      lastUpdatedAt: timestamp,
    },
    verificationState: {
      status: "idle",
      attempts: 0,
      reminderCount: 0,
      noProgressCount: 0,
      maxAttempts: 3,
      maxNoProgress: 2,
      maxReminders: 3,
      pendingPaths: [],
      updatedAt: timestamp,
    },
    checkpoint: {
      objective: "Continue the legacy task.",
      completedSteps: ["Completed the setup phase"],
    },
  };
  await fs.writeFile(path.join(sessionsDir, `${legacySessionId}.json`), `${JSON.stringify(rawSession, null, 2)}\n`, "utf8");

  const sessionStore = new SessionStore(sessionsDir);
  const loaded = await sessionStore.load(legacySessionId);
  const checkpoint = (loaded as any).checkpoint;

  assert.equal(checkpoint?.objective, "Continue the legacy task.");
  assert.equal(checkpoint?.status, "active");
  assert.equal(checkpoint?.flow?.phase, "active");
  assert.equal(checkpoint?.completedSteps?.includes("Completed the setup phase"), true);
  assert.equal(checkpoint?.nextStep, "Resume validation/round2-resume-summary.md");
  assert.ok(Array.isArray(checkpoint?.priorityArtifacts));
});

test("runtime checkpoint keeps a structured checkpoint block available even when histories are compressed", { concurrency: false }, () => {
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
    currentStep: "Resuming after disk reload",
    nextStep: "Write validation/round2-resume-summary.md",
    flow: {
      phase: "resume",
    },
    priorityArtifacts: [
      {
        kind: "externalized_tool_result",
        toolName: "emit_large_checkpoint",
        storagePath: ".athlete/tool-results/session-a/large.json",
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
      reminderCount: 0,
      noProgressCount: 0,
      maxAttempts: 3,
      maxNoProgress: 2,
      maxReminders: 3,
      pendingPaths: [],
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
  assert.match(String(built.messages[0]?.content ?? ""), /Session checkpoint:/i);
  assert.match(String(built.messages[0]?.content ?? ""), /Loaded the persisted setup artifact/i);
  assert.match(String(built.messages[0]?.content ?? ""), /Write validation\/round2-resume-summary\.md/i);
  assert.match(String(built.messages[0]?.content ?? ""), /\.athlete\/tool-results\/session-a\/large\.json/i);
});

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
