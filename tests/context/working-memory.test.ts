import assert from "node:assert/strict";
import test from "node:test";

import { buildAgentWorkingMemory } from "../../src/context/runtime/workingMemory/build.js";

test("working memory keeps current objective facts compact", () => {
  const memory = buildAgentWorkingMemory({
    taskState: {
      objective: "重建扩展工具",
      activeFiles: ["a.ts", "b.ts", "a.ts"],
      plannedActions: ["写 spec", "写测试"],
      completedActions: ["读历史"],
      blockers: [],
      lastUpdatedAt: "2026-01-01T00:00:00.000Z",
    },
    timestamp: "2026-01-01T00:00:01.000Z",
  });

  assert.equal(memory.objective, "重建扩展工具");
  assert.deepEqual(memory.activeFiles, ["b.ts", "a.ts"]);
  assert.deepEqual(memory.plannedActions, ["写 spec", "写测试"]);
});
