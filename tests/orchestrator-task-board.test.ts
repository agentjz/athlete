import assert from "node:assert/strict";
import test from "node:test";

import { ensureTaskPlan } from "../src/orchestrator/taskPlanning.js";
import { TaskStore } from "../src/tasks/store.js";
import { createTempWorkspace } from "./helpers.js";

test("ensureTaskPlan writes a minimal persistent task graph for complex lead work", async (t) => {
  const root = await createTempWorkspace("orchestrator-plan", t);
  const plan = await ensureTaskPlan({
    rootDir: root,
    cwd: root,
    analysis: {
      objective: {
        key: "objective-graph",
        text: "Refactor the CLI flow, then validate the runtime behavior.",
      },
      complexity: "complex",
      needsInvestigation: true,
      prefersParallel: true,
      wantsBackground: false,
      wantsSubagent: true,
      wantsTeammate: true,
      backgroundCommand: undefined,
    },
    existingTasks: [],
  });

  const store = new TaskStore(root);
  const tasks = await store.list();
  const survey = tasks.find((task) => task.subject.startsWith("Survey:"));
  const implementation = tasks.find((task) => task.subject.startsWith("Implement:"));
  const validation = tasks.find((task) => task.subject.startsWith("Validate:"));

  assert.equal(plan.createdTaskIds.length, 3);
  assert.equal(tasks.length, 3);
  assert.ok(survey);
  assert.ok(implementation);
  assert.ok(validation);
  assert.deepEqual(implementation?.blockedBy, [survey?.id]);
  assert.deepEqual(validation?.blockedBy, [implementation?.id]);
  assert.match(String(survey?.description ?? ""), /athlete-orchestrator/i);
});
