import assert from "node:assert/strict";
import test from "node:test";

import { createCheckpointForObjective } from "../../src/agent/checkpoint/base.js";
import { buildAgentWorkingMemory } from "../../src/agent/contextRuntime/workingMemory/index.js";

test("working memory keeps current objective facts and rejects stale checkpoint residue", () => {
  const timestamp = "2026-05-03T00:00:00.000Z";
  const staleCheckpoint = createCheckpointForObjective("old task", timestamp);
  staleCheckpoint.completedSteps = ["old completed step"];
  staleCheckpoint.recentToolBatch = {
    tools: ["read_file"],
    summary: "old tool batch",
    changedPaths: ["old.ts"],
    artifacts: [],
    recordedAt: timestamp,
  };

  const memory = buildAgentWorkingMemory({
    timestamp,
    taskState: {
      objective: "current task",
      activeFiles: ["src/current.ts"],
      plannedActions: ["inspect current file"],
      completedActions: ["confirmed current package"],
      blockers: ["need evidence"],
      lastUpdatedAt: timestamp,
    },
    todoItems: [
      { id: "todo-1", text: "inspect current file", status: "in_progress" },
    ],
    checkpoint: staleCheckpoint,
  });

  assert.equal(memory.objective, "current task");
  assert.deepEqual(memory.completedActions, ["confirmed current package"]);
  assert.equal(memory.recentToolBatch, undefined);
  assert.deepEqual(memory.evidenceArtifacts, []);
  assert.equal(JSON.stringify(memory).includes("old completed step"), false);
  assert.equal(JSON.stringify(memory).includes("old.ts"), false);
});

test("working memory preserves current checkpoint evidence as short task state", () => {
  const timestamp = "2026-05-03T00:00:00.000Z";
  const checkpoint = createCheckpointForObjective("current task", timestamp);
  checkpoint.completedSteps = ["captured requirements", "wrote design"];
  checkpoint.recentToolBatch = {
    tools: ["write_file", "run_shell"],
    summary: "Ran write_file, run_shell; changed spec.md",
    changedPaths: ["spec.md"],
    artifacts: [
      {
        kind: "tool_preview",
        label: "spec.md",
        path: "spec.md",
      },
    ],
    recordedAt: timestamp,
  };
  checkpoint.evidenceArtifacts = checkpoint.recentToolBatch.artifacts;

  const memory = buildAgentWorkingMemory({
    timestamp,
    taskState: {
      objective: "current task",
      activeFiles: [],
      plannedActions: [],
      completedActions: [],
      blockers: [],
      lastUpdatedAt: timestamp,
    },
    checkpoint,
    verificationState: {
      status: "passed",
      attempts: 1,
      observedPaths: ["spec.md"],
      lastCommand: "npm.cmd run test:core",
      lastKind: "test",
      lastExitCode: 0,
      updatedAt: timestamp,
    },
  });

  assert.deepEqual(memory.completedActions, ["captured requirements", "wrote design"]);
  assert.equal(memory.recentToolBatch?.tools.join(","), "write_file,run_shell");
  assert.equal(memory.recentToolBatch?.changedPaths[0], "spec.md");
  assert.equal(memory.evidenceArtifacts[0]?.label, "spec.md");
  assert.equal(memory.verification?.status, "passed");
});
