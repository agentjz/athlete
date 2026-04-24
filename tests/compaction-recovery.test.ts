import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { runManagedAgentTurn } from "../src/agent/turn.js";
import { SessionStore, createMessage } from "../src/agent/session.js";
import type { ToolRegistry } from "../src/tools/types.js";
import { createTempWorkspace, createTestRuntimeConfig } from "./helpers.js";

test("post-compaction degradation keeps checkpoint state and eventually pauses instead of silently looping forever", { concurrency: false }, async (t) => {
  const root = await createTempWorkspace("compaction-recovery", t);
  const sessionStore = new SessionStore(path.join(root, "sessions"));
  const baseSession = await sessionStore.create(root);
  const seeded = await sessionStore.save({
    ...baseSession,
    messages: [
      ...Array.from({ length: 14 }, (_, index) =>
        index % 2 === 0
          ? createMessage("user", `older-user-${index} ${"U".repeat(1_200)}`)
          : createMessage("assistant", `older-assistant-${index} ${"A".repeat(1_200)}`),
      ),
      createMessage("user", "Recover the compressed session without restarting."),
      createMessage("assistant", "Checkpoint captured; continue from the saved state."),
    ],
    todoItems: [
      {
        id: "todo-1",
        text: "Keep the degraded run resumable.",
        status: "in_progress",
      },
    ],
    taskState: {
      ...(baseSession.taskState ?? {
        activeFiles: [],
        plannedActions: [],
        completedActions: [],
        blockers: [],
        lastUpdatedAt: new Date().toISOString(),
      }),
      objective: "Recover the compressed session without restarting.",
      completedActions: ["Captured the original task context."],
      plannedActions: ["Resume from the saved checkpoint instead of restarting."],
      lastUpdatedAt: new Date().toISOString(),
    },
    checkpoint: {
      version: 1,
      objective: "Recover the compressed session without restarting.",
      status: "active",
      completedSteps: ["Captured the original task context."],
      currentStep: "Keep the degraded run resumable.",
      nextStep: "Resume from the saved checkpoint instead of restarting.",
      flow: {
        phase: "continuation",
        updatedAt: new Date().toISOString(),
      },
      priorityArtifacts: [],
      updatedAt: new Date().toISOString(),
    },
    verificationState: {
      ...(baseSession.verificationState ?? {
        status: "passed",
        attempts: 0,
        reminderCount: 0,
        noProgressCount: 0,
        maxAttempts: 3,
        maxNoProgress: 2,
        maxReminders: 3,
        pendingPaths: [],
        updatedAt: new Date().toISOString(),
      }),
      status: "passed",
      pendingPaths: [],
      updatedAt: new Date().toISOString(),
    },
  });

  const server = await startFakeOpenAiServer(() => blankResponse());
  t.after(async () => {
    await server.close();
  });

  const result = await runManagedAgentTurn({
    input: "continue",
    cwd: root,
    config: {
      ...createTestRuntimeConfig(root),
      baseUrl: server.baseUrl,
      contextWindowMessages: 6,
      maxContextChars: 4_500,
      contextSummaryChars: 700,
    },
    session: seeded,
    sessionStore,
    toolRegistry: createEmptyToolRegistry(),
    identity: {
      kind: "teammate",
      name: "recovery-test",
    },
  });

  assert.equal(result.paused, true);
  assert.equal(result.transition?.reason.code, "pause.degradation_recovery_exhausted");
  assert.equal(result.session.checkpoint?.objective, "Recover the compressed session without restarting.");
  assert.equal(result.session.checkpoint?.completedSteps?.includes("Captured the original task context."), true);
  assert.equal(result.session.todoItems?.[0]?.text, "Keep the degraded run resumable.");
  assert.equal(result.session.verificationState?.status, "idle");
  assert.equal(result.session.verificationState?.maxAttempts, 3);
  assert.equal(result.session.checkpoint?.flow?.phase, "recovery");
});

function createEmptyToolRegistry(): ToolRegistry {
  return {
    definitions: [],
    async execute() {
      throw new Error("No tools should execute in this test.");
    },
  };
}

function blankResponse(): {
  content: string;
} {
  return {
    content: "   ",
  };
}

async function startFakeOpenAiServer(
  respond: () => { content: string },
): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/chat/completions") {
      res.writeHead(404).end();
      return;
    }

    await readRequestBody(req);
    const response = respond();

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
    });
    res.write(
      `data: ${JSON.stringify({
        choices: [
          {
            delta: {
              content: response.content,
            },
          },
        ],
      })}\n\n`,
    );
    res.end("data: [DONE]\n\n");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected an ephemeral HTTP port.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () =>
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
