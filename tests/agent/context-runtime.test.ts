import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContextRuntimeRequest,
  buildContextRuntimeSnapshot,
  buildContextRuntimeToolProgress,
} from "../../src/agent/contextRuntime/index.js";
import { createCheckpointForObjective } from "../../src/agent/checkpoint/base.js";
import { createMessage } from "../../src/agent/session.js";
import { createTestRuntimeConfig } from "../helpers.js";

test("context runtime snapshot centralizes session brief, working memory, history boundary, and tool progress", () => {
  const timestamp = "2026-05-03T00:00:00.000Z";
  const staleCheckpoint = createCheckpointForObjective("old objective", timestamp);
  staleCheckpoint.completedSteps = ["old completed step"];
  const toolProgress = buildContextRuntimeToolProgress({
    iteration: 4,
    maxToolIterations: 3,
    maxContinuationBatches: 2,
    yieldAfterToolSteps: 4,
  });

  const snapshot = buildContextRuntimeSnapshot({
    session: {
      messages: [
        createMessage("user", "确认：同 session 连续性要保留。"),
        createMessage("assistant", "我会保留高信号简报。"),
        createMessage("user", "当前任务是重构 context runtime。"),
      ],
      taskState: {
        objective: "current objective",
        activeFiles: ["src/agent/contextRuntime/index.ts"],
        plannedActions: ["centralize context runtime"],
        completedActions: ["created snapshot"],
        blockers: [],
        lastUpdatedAt: timestamp,
      },
      todoItems: [
        { id: "todo-1", text: "wire context runtime", status: "in_progress" },
      ],
      checkpoint: staleCheckpoint,
      verificationState: undefined,
      acceptanceState: undefined,
    },
    toolProgress,
  });

  assert.match(snapshot.sessionBrief?.currentThread ?? "", /context runtime/);
  assert.equal(snapshot.workingMemory.objective, "current objective");
  assert.equal(JSON.stringify(snapshot.workingMemory).includes("old completed step"), false);
  assert.equal(snapshot.historyBoundary.rawHistoryPolicy, "evidence_lookup_only");
  assert.deepEqual(snapshot.historyBoundary.automaticSurfaces, [
    "same-session conversation brief",
    "current-objective working memory",
  ]);
  assert.equal(snapshot.toolProgress?.shouldYield, true);
  assert.equal(snapshot.toolProgress?.continuationWindow, 6);
});

test("context runtime request owns compression entry instead of callers stitching request context directly", () => {
  const config = createTestRuntimeConfig(process.cwd());
  const request = buildContextRuntimeRequest({
    prompt: {
      staticBlocks: ["system"],
      profilePersonaBlocks: [],
      runtimeFactBlocks: [],
    },
    session: {
      messages: [
        createMessage("user", "current objective"),
        ...Array.from({ length: 20 }, (_, index) =>
          createMessage("assistant", `assistant-${index} ${"x".repeat(1_000)}`)),
      ],
    },
    config: {
      contextWindowMessages: 12,
      model: config.model,
      maxContextChars: 8_500,
      contextSummaryChars: 1_200,
    },
  });

  assert.equal(request.compressed, true);
  assert.equal(request.contextDiagnostics.maxContextChars, 8_500);
  assert.equal(request.messages[0]?.role, "system");
});
